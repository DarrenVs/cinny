import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Chip, Icon, IconButton, Icons, Scroll, Spinner, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useRoom } from '../../../hooks/useRoom';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { usePowerLevels, useRoomsPowerLevels } from '../../../hooks/usePowerLevels';
import { useRoomCreators, getRoomCreatorsForRoomId } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { useSpaceRoomTemplates } from '../../../hooks/useSpaceRoomTemplates';
import { useAccountRoomTemplates } from '../../../hooks/useAccountRoomTemplates';
import { useSpaceHierarchy } from '../../../hooks/useSpaceHierarchy';
import { StateEvent, RoomType } from '../../../../types/matrix/room';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { RoomTemplate, RoomTemplatesContent } from '../../../../types/matrix/roomTemplates';
import {
  canManageSpaceTemplates,
  canApplyTemplateToRoom,
  saveTemplate,
  deleteTemplate,
  getTemplatesForRoomType,
} from '../../../utils/roomTemplates';
import { applyTemplateToRoom } from '../../../utils/roomTemplates';
import { withRateLimitRetry, classifyMatrixError } from '../../../utils/matrix';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { TemplatePermissionsEditor } from './TemplatePermissionsEditor';
import { ApplyTemplateRooms } from './ApplyTemplateRooms';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { ClickableCardStyle, SequenceCardStyle } from '../../common-settings/styles.css';

type RoomTypeTab = { label: string; value: string | null };

const ROOM_TYPE_TABS: RoomTypeTab[] = [
  { label: 'Chat', value: null },
  { label: 'Voice', value: RoomType.Call },
  { label: 'Space', value: RoomType.Space },
];

type ApplyStage = 'closed' | 'select-rooms';

type RoomTemplatesProps = {
  requestClose: () => void;
};

export function RoomTemplates({ requestClose }: RoomTemplatesProps) {
  const mx = useMatrixClient();
  const space = useRoom();
  const powerLevels = usePowerLevels(space);
  const creators = useRoomCreators(space);
  const permissions = useRoomPermissions(creators, powerLevels);

  const spaceTemplates = useSpaceRoomTemplates(space);
  const accountTemplates = useAccountRoomTemplates();

  const spaceRooms = useMemo(() => {
    const set = new Set<string>();
    mx.getRooms().forEach((r) => { if (r.isSpaceRoom()) set.add(r.roomId); });
    return set;
  }, [mx]);
  const getRoom = useCallback((roomId: string) => mx.getRoom(roomId) ?? undefined, [mx]);
  const closedCategory = useCallback(() => false, []);

  const hierarchy = useSpaceHierarchy(space.roomId, spaceRooms, getRoom, closedCategory);

  // Flat list of all descendants (sub-spaces + rooms) for power level queries
  const allDescendants = useMemo(() => {
    const rooms: Room[] = [];
    hierarchy.forEach(({ space: spaceItem, rooms: roomItems }) => {
      if (spaceItem.roomId !== space.roomId) {
        const r = mx.getRoom(spaceItem.roomId);
        if (r) rooms.push(r);
      }
      roomItems?.forEach((item) => {
        const r = mx.getRoom(item.roomId);
        if (r) rooms.push(r);
      });
    });
    return rooms;
  }, [hierarchy, space.roomId, mx]);

  const roomPowerLevels = useRoomsPowerLevels(allDescendants);

  const canManage = canManageSpaceTemplates(powerLevels, creators, mx.getSafeUserId());

  const canModifyRooms = useMemo(() => {
    const map = new Map<string, boolean>();
    allDescendants.forEach((room) => {
      const pl = roomPowerLevels.get(room.roomId) ?? {};
      const roomCreators = getRoomCreatorsForRoomId(mx, room.roomId);
      map.set(room.roomId, canApplyTemplateToRoom(pl, roomCreators, mx.getSafeUserId()));
    });
    return map;
  }, [allDescendants, roomPowerLevels, mx]);

  const [editingTemplate, setEditingTemplate] = useState<RoomTemplate | null | 'new'>(null);
  const [applyingTemplate, setApplyingTemplate] = useState<RoomTemplate | null>(null);
  const [applyStage, setApplyStage] = useState<ApplyStage>('closed');
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());

  const selectedRoomObjects = useMemo(
    () => allDescendants.filter((r) => selectedRooms.has(r.roomId)),
    [allDescendants, selectedRooms]
  );

  const saveTemplatesToSpace = useCallback(
    async (content: RoomTemplatesContent) => {
      await mx.sendStateEvent(space.roomId, StateEvent.SpaceRoomTemplates as any, content);
    },
    [mx, space.roomId]
  );

  const [saveState, handleSaveTemplate] = useAsyncCallback(
    useCallback(
      async (template: RoomTemplate) => {
        const updated = saveTemplate(spaceTemplates, template);
        await saveTemplatesToSpace(updated);
        setEditingTemplate(null);
      },
      [spaceTemplates, saveTemplatesToSpace]
    )
  );

  const [deleteState, handleDeleteTemplate] = useAsyncCallback(
    useCallback(
      async (templateId: string) => {
        const updated = deleteTemplate(spaceTemplates, templateId);
        await saveTemplatesToSpace(updated);
      },
      [spaceTemplates, saveTemplatesToSpace]
    )
  );

  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyErrors, setApplyErrors] = useState<Array<{ roomName: string; reason: string }>>([]);
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);

  const handleApply = useCallback(async () => {
    if (!applyingTemplate) return;
    setApplying(true);
    setApplyProgress(0);
    setApplyErrors([]);
    setErrorDetailsOpen(false);
    const errors: Array<{ roomName: string; reason: string }> = [];

    for (let i = 0; i < selectedRoomObjects.length; i += 1) {
      const room = selectedRoomObjects[i];
      try {
        const pl = roomPowerLevels.get(room.roomId) ?? {};
        const resolvedTags = applyingTemplate.powerLevelTags;
        await withRateLimitRetry(() => applyTemplateToRoom(mx, room, applyingTemplate, pl, resolvedTags));
      } catch (e) {
        errors.push({ roomName: room.name || room.roomId, reason: classifyMatrixError(e) });
      }
      setApplyProgress(i + 1);
      // Delay between rooms — applyTemplateToRoom can send two state events per room
      // (power_levels + tags), so bursts are more likely without a pause.
      if (i < selectedRoomObjects.length - 1) {
        await new Promise((resolve) => { setTimeout(resolve, 500); });
      }
    }

    setApplying(false);

    if (errors.length === 0) {
      setApplyStage('closed');
      setApplyingTemplate(null);
      setSelectedRooms(new Set());
    } else {
      setApplyErrors(errors);
    }
  }, [applyingTemplate, selectedRoomObjects, roomPowerLevels, mx]);

  const handlePushToAccount = useCallback(
    async (template: RoomTemplate) => {
      const updated = saveTemplate(accountTemplates, template);
      await mx.setAccountData(AccountDataEvent.RoomTemplates as any, updated as any);
    },
    [accountTemplates, mx]
  );

  const templateSections = useMemo(
    () =>
      ROOM_TYPE_TABS.map((tab) => ({
        ...tab,
        templates: getTemplatesForRoomType(spaceTemplates, tab.value),
      })).filter((s) => s.templates.length > 0),
    [spaceTemplates]
  );

  // ── Editing template ──────────────────────────────────────────────────────────
  if (editingTemplate !== null) {
    return (
      <TemplatePermissionsEditor
        existing={editingTemplate === 'new' ? undefined : editingTemplate}
        initialRoomType={undefined}
        contextRoom={space}
        onSave={(template) => handleSaveTemplate(template)}
        onCancel={() => setEditingTemplate(null)}
        onSaveToAccount={handlePushToAccount}
        availableTemplates={[
          ...spaceTemplates.presets,
          ...accountTemplates.presets,
        ].filter((t) => t.id !== (editingTemplate !== 'new' ? editingTemplate?.id : undefined))}
      />
    );
  }

  // ── Apply to rooms — room selection ────────────────────────────────────────
  if (applyingTemplate && applyStage === 'select-rooms') {
    return (
      <Page>
        <PageHeader outlined={false}>
          <Box grow="Yes" gap="200" alignItems="Center">
            <IconButton
              onClick={() => {
                setApplyStage('closed');
                setApplyingTemplate(null);
              }}
              variant="Surface"
            >
              <Icon src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="H3" truncate>
              Apply &quot;{applyingTemplate.name}&quot;
            </Text>
          </Box>
        </PageHeader>
        <Box grow="Yes">
          <Scroll hideTrack visibility="Hover">
            <PageContent>
              <Box direction="Column" gap="400">
                {applyingTemplate.powerLevelTags &&
                  Object.keys(applyingTemplate.powerLevelTags).length > 0 && (
                    <Box
                      direction="Column"
                      gap="100"
                      style={{
                        padding: '12px',
                        background: 'var(--cpd-color-bg-caution-subtle)',
                        borderRadius: '8px',
                      }}
                    >
                      <Text size="T300">
                        <b>Power level labels will be updated</b>
                      </Text>
                      <Text size="T200">
                        This template includes power level labels. Applying it will update labels in
                        selected rooms — labels at the same power level as the template&apos;s labels
                        will be replaced.
                      </Text>
                    </Box>
                  )}
                <Text size="T300" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  Select rooms to apply this template to. Only compatible rooms are shown.
                </Text>
                <ApplyTemplateRooms
                  hierarchy={hierarchy}
                  rootSpaceId={space.roomId}
                  roomPowerLevels={roomPowerLevels}
                  canModifyRooms={canModifyRooms}
                  template={applyingTemplate}
                  selectedRooms={selectedRooms}
                  onSelectionChange={(roomId, selected) => {
                    setSelectedRooms((prev) => {
                      const next = new Set(prev);
                      if (selected) next.add(roomId);
                      else next.delete(roomId);
                      return next;
                    });
                  }}
                />

                {applyErrors.length > 0 && (
                  <Box direction="Column" gap="200">
                    <Box gap="200" alignItems="Center">
                      <Icon src={Icons.Warning} size="200" style={{ color: 'var(--cpd-color-text-critical-primary)', flexShrink: 0 }} />
                      <Text size="T200" style={{ color: 'var(--cpd-color-text-critical-primary)', flexGrow: 1 }}>
                        {applyErrors.length} room{applyErrors.length !== 1 ? 's' : ''} could not be updated.
                      </Text>
                      <Button
                        variant="Secondary"
                        fill="None"
                        size="300"
                        radii="300"
                        after={<Icon src={errorDetailsOpen ? Icons.ChevronTop : Icons.ChevronBottom} size="100" />}
                        onClick={() => setErrorDetailsOpen((v) => !v)}
                      >
                        <Text size="T200">{errorDetailsOpen ? 'Hide details' : 'Show details'}</Text>
                      </Button>
                    </Box>
                    {errorDetailsOpen && (
                      <Box direction="Column" gap="100" style={{ paddingLeft: '28px' }}>
                        {applyErrors.map(({ roomName, reason }) => (
                          <Box key={roomName} gap="300" alignItems="Center">
                            <Text size="T200" style={{ flexGrow: 1 }}>
                              <b>{roomName}</b>
                            </Text>
                            <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                              {reason}
                            </Text>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                )}

                <Box gap="200" justifyContent="End">
                  {applyErrors.length > 0 ? (
                    <Button
                      variant="Primary"
                      onClick={() => {
                        setApplyStage('closed');
                        setApplyingTemplate(null);
                        setSelectedRooms(new Set());
                        setApplyErrors([]);
                      setErrorDetailsOpen(false);
                      }}
                    >
                      <Text size="B300">Done</Text>
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="Secondary"
                        disabled={applying}
                        onClick={() => {
                          setApplyStage('closed');
                          setApplyingTemplate(null);
                        }}
                      >
                        <Text size="B300">Cancel</Text>
                      </Button>
                      <Button
                        variant="Primary"
                        disabled={selectedRooms.size === 0 || applying}
                        before={applying && <Spinner size="200" variant="Primary" fill="Solid" />}
                        onClick={handleApply}
                      >
                        <Text size="B300">
                          {applying
                            ? `Applying… ${applyProgress} / ${selectedRooms.size}`
                            : `Apply to ${selectedRooms.size} room${selectedRooms.size !== 1 ? 's' : ''}`}
                        </Text>
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            </PageContent>
          </Scroll>
        </Box>
      </Page>
    );
  }

  // ── Main list view ──────────────────────────────────────────────────────────
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200" alignItems="Center">
          <Box grow="Yes" alignItems="Center">
            <Text size="H3" truncate>
              Blueprints
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="500">
              {/* Action buttons */}
              {canManage && (
                <Box gap="200" wrap="Wrap">
                  <Button
                    size="300"
                    variant="Primary"
                    radii="300"
                    before={<Icon src={Icons.Plus} size="100" />}
                    onClick={() => setEditingTemplate('new')}
                  >
                    <Text size="B300">New Blueprint</Text>
                  </Button>
                </Box>
              )}

              {/* Empty state */}
              {templateSections.length === 0 && (
                <Box
                  direction="Column"
                  gap="200"
                  alignItems="Center"
                  style={{ padding: '32px', color: 'var(--cpd-color-text-secondary)' }}
                >
                  <Icon src={Icons.Setting} size="400" />
                  <Text size="T200">No blueprints yet.</Text>
                  {canManage && (
                    <Button
                      size="300"
                      variant="Secondary"
                      radii="300"
                      before={<Icon src={Icons.Plus} size="100" />}
                      onClick={() => setEditingTemplate('new')}
                    >
                      <Text size="B300">Create one</Text>
                    </Button>
                  )}
                </Box>
              )}

              {/* Grouped sections */}
              {templateSections.map((section) => (
                <Box key={section.label} direction="Column" gap="300">
                  <Text size="L400">{section.label}</Text>
                  <Box direction="Column" gap="300">
                  {section.templates.map((template) => (
                    <SequenceCard
                      key={template.id}
                      variant="SurfaceVariant"
                      className={`${SequenceCardStyle} ${canManage ? ClickableCardStyle : ''}`}
                      direction="Column"
                      gap="300"
                      tabIndex={canManage ? 0 : undefined}
                      onClick={canManage ? () => setEditingTemplate(template) : undefined}
                    >
                      <SettingTile
                        before={<Icon src={Icons.File} size="200" />}
                        title={template.name}
                        description={template.description}
                        after={
                          <Box gap="100" shrink="No">
                            {template.powerLevelTags &&
                              Object.keys(template.powerLevelTags).length > 0 && (
                                <Box
                                  style={{
                                    padding: '2px 10px',
                                    borderRadius: '999px',
                                    background: 'var(--cpd-color-bg-subtle-secondary)',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <Text size="T200">Labels</Text>
                                </Box>
                              )}
                            {template.permissions &&
                              Object.keys(template.permissions).length > 0 && (
                                <Box
                                  style={{
                                    padding: '2px 10px',
                                    borderRadius: '999px',
                                    background: 'var(--cpd-color-bg-subtle-secondary)',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <Text size="T200">Permissions</Text>
                                </Box>
                              )}
                          </Box>
                        }
                      />
                      <Box gap="200" alignItems="Center" justifyContent="SpaceBetween" wrap="Wrap">
                        <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                          Updated {new Date(template.updatedAt).toLocaleDateString()}
                        </Text>
                        {canManage && (
                          <Box gap="200" wrap="Wrap">
                            <Button
                              size="300"
                              variant="Secondary"
                              radii="300"
                              before={<Icon src={Icons.ArrowTop} size="100" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setApplyingTemplate(template);
                                setSelectedRooms(new Set());
                                setApplyStage('select-rooms');
                              }}
                            >
                              <Text size="B300">Apply to Rooms</Text>
                            </Button>
                            <Button
                              size="300"
                              variant="Secondary"
                              radii="300"
                              before={<Icon src={Icons.Cross} size="100" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTemplate(template.id);
                              }}
                              disabled={deleteState.status === AsyncStatus.Loading}
                            >
                              <Text size="B300">Delete</Text>
                            </Button>
                          </Box>
                        )}
                      </Box>
                    </SequenceCard>
                  ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
