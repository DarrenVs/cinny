import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Chip, Icon, IconButton, Icons, Scroll, Spinner, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useRoom } from '../../../hooks/useRoom';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { usePowerLevels, useRoomsPowerLevels } from '../../../hooks/usePowerLevels';
import { useRoomCreators, getRoomCreatorsForRoomId } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { useSpaceRoomPresets } from '../../../hooks/useSpaceRoomPresets';
import { useAccountRoomPresets } from '../../../hooks/useAccountRoomPresets';
import { useSpaceHierarchy } from '../../../hooks/useSpaceHierarchy';
import { StateEvent, RoomType } from '../../../../types/matrix/room';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { RoomPreset, RoomPresetsContent } from '../../../../types/matrix/roomPresets';
import {
  canManageSpacePresets,
  canApplyPresetToRoom,
  savePreset,
  deletePreset,
  getPresetsForRoomType,
} from '../../../utils/roomPresets';
import { rateLimitedActions } from '../../../utils/matrix';
import { applyPresetToRoom } from '../../../utils/roomPresets';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { PresetPermissionsEditor } from './PresetPermissionsEditor';
import { ApplyPresetRooms } from './ApplyPresetRooms';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../../common-settings/styles.css';

type RoomTypeTab = { label: string; value: string | null };

const ROOM_TYPE_TABS: RoomTypeTab[] = [
  { label: 'Chat', value: null },
  { label: 'Voice', value: RoomType.Call },
  { label: 'Space', value: RoomType.Space },
];

type ApplyStage = 'closed' | 'select-rooms';

type RoomPresetsProps = {
  requestClose: () => void;
};

export function RoomPresets({ requestClose }: RoomPresetsProps) {
  const mx = useMatrixClient();
  const space = useRoom();
  const powerLevels = usePowerLevels(space);
  const creators = useRoomCreators(space);
  const permissions = useRoomPermissions(creators, powerLevels);

  const spacePresets = useSpaceRoomPresets(space);
  const accountPresets = useAccountRoomPresets();

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

  const canManage = canManageSpacePresets(powerLevels, creators, mx.getSafeUserId());

  const canModifyRooms = useMemo(() => {
    const map = new Map<string, boolean>();
    allDescendants.forEach((room) => {
      const pl = roomPowerLevels.get(room.roomId) ?? {};
      const roomCreators = getRoomCreatorsForRoomId(mx, room.roomId);
      map.set(room.roomId, canApplyPresetToRoom(pl, roomCreators, mx.getSafeUserId()));
    });
    return map;
  }, [allDescendants, roomPowerLevels, mx]);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<RoomPreset | null | 'new'>(null);
  const [applyingPreset, setApplyingPreset] = useState<RoomPreset | null>(null);
  const [applyStage, setApplyStage] = useState<ApplyStage>('closed');
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());

  const selectedRoomObjects = useMemo(
    () => allDescendants.filter((r) => selectedRooms.has(r.roomId)),
    [allDescendants, selectedRooms]
  );

  const savePresetsToSpace = useCallback(
    async (content: RoomPresetsContent) => {
      await mx.sendStateEvent(space.roomId, StateEvent.SpaceRoomPresets as any, content);
    },
    [mx, space.roomId]
  );

  const [saveState, handleSavePreset] = useAsyncCallback(
    useCallback(
      async (preset: RoomPreset) => {
        const updated = savePreset(spacePresets, preset);
        await savePresetsToSpace(updated);
        setEditingPreset(null);
      },
      [spacePresets, savePresetsToSpace]
    )
  );

  const [deleteState, handleDeletePreset] = useAsyncCallback(
    useCallback(
      async (presetId: string) => {
        const updated = deletePreset(spacePresets, presetId);
        await savePresetsToSpace(updated);
      },
      [spacePresets, savePresetsToSpace]
    )
  );

  const [applyState, handleApply] = useAsyncCallback(
    useCallback(async () => {
      if (!applyingPreset) return;
      await rateLimitedActions(selectedRoomObjects, async (room) => {
        const pl = roomPowerLevels.get(room.roomId) ?? {};
        // When applying from space settings, overwrite tags with preset tags (no per-conflict dialog)
        const resolvedTags = applyingPreset.powerLevelTags;
        await applyPresetToRoom(mx, room, applyingPreset, pl, resolvedTags);
      });
      setApplyStage('closed');
      setApplyingPreset(null);
      setSelectedRooms(new Set());
    }, [applyingPreset, selectedRoomObjects, roomPowerLevels, mx])
  );

  const handlePushToAccount = useCallback(
    async (preset: RoomPreset) => {
      const updated = savePreset(accountPresets, preset);
      await mx.setAccountData(AccountDataEvent.RoomPresets as any, updated as any);
    },
    [accountPresets, mx]
  );

  const currentTabPresets = useMemo(
    () => getPresetsForRoomType(spacePresets, activeTab),
    [spacePresets, activeTab]
  );

  // ── Editing preset ──────────────────────────────────────────────────────────
  if (editingPreset !== null) {
    return (
      <PresetPermissionsEditor
        existing={editingPreset === 'new' ? undefined : editingPreset}
        initialRoomType={editingPreset === 'new' ? activeTab : undefined}
        contextRoom={space}
        onSave={(preset) => handleSavePreset(preset)}
        onCancel={() => setEditingPreset(null)}
      />
    );
  }

  // ── Apply to rooms — room selection ────────────────────────────────────────
  if (applyingPreset && applyStage === 'select-rooms') {
    return (
      <Page>
        <PageHeader outlined={false}>
          <Box grow="Yes" gap="200" alignItems="Center">
            <IconButton
              onClick={() => {
                setApplyStage('closed');
                setApplyingPreset(null);
              }}
              variant="Surface"
            >
              <Icon src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="H3" truncate>
              Apply &quot;{applyingPreset.name}&quot;
            </Text>
          </Box>
        </PageHeader>
        <Box grow="Yes">
          <Scroll hideTrack visibility="Hover">
            <PageContent>
              <Box direction="Column" gap="400">
                {applyingPreset.powerLevelTags &&
                  Object.keys(applyingPreset.powerLevelTags).length > 0 && (
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
                        This preset includes power level labels. Applying it will update labels in
                        selected rooms — labels at the same power level as the preset&apos;s labels
                        will be replaced.
                      </Text>
                    </Box>
                  )}
                <Text size="T300" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  Select rooms to apply this preset to. Only compatible rooms are shown.
                </Text>
                <ApplyPresetRooms
                  hierarchy={hierarchy}
                  rootSpaceId={space.roomId}
                  roomPowerLevels={roomPowerLevels}
                  canModifyRooms={canModifyRooms}
                  preset={applyingPreset}
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

                {applyState.status === AsyncStatus.Error && (
                  <Text size="T200" style={{ color: 'var(--cpd-color-text-critical-primary)' }}>
                    Failed to apply preset. Please try again.
                  </Text>
                )}

                <Box gap="200" justifyContent="End">
                  <Button
                    variant="Secondary"
                    onClick={() => {
                      setApplyStage('closed');
                      setApplyingPreset(null);
                    }}
                  >
                    <Text size="B300">Cancel</Text>
                  </Button>
                  <Button
                    variant="Primary"
                    disabled={selectedRooms.size === 0 || applyState.status === AsyncStatus.Loading}
                    before={
                      applyState.status === AsyncStatus.Loading && (
                        <Spinner size="200" variant="Primary" fill="Solid" />
                      )
                    }
                    onClick={() => handleApply()}
                  >
                    <Text size="B300">
                      {applyState.status === AsyncStatus.Loading
                        ? 'Applying...'
                        : `Apply to ${selectedRooms.size} room${selectedRooms.size !== 1 ? 's' : ''}`}
                    </Text>
                  </Button>
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
              Room Presets
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
              {/* Room type tabs */}
              <Box gap="200" wrap="Wrap">
                {ROOM_TYPE_TABS.map((tab) => (
                  <Chip
                    key={tab.label}
                    variant={activeTab === tab.value ? 'Primary' : 'Secondary'}
                    onClick={() => setActiveTab(tab.value)}
                    aria-pressed={activeTab === tab.value}
                    radii="Pill"
                  >
                    <Text size="B300">{tab.label}</Text>
                  </Chip>
                ))}
              </Box>

              {/* Action buttons */}
              {canManage && (
                <Box gap="200" wrap="Wrap">
                  <Button
                    size="300"
                    variant="Primary"
                    radii="300"
                    before={<Icon src={Icons.Plus} size="100" />}
                    onClick={() => setEditingPreset('new')}
                  >
                    <Text size="B300">New Preset</Text>
                  </Button>
                </Box>
              )}

              {/* Preset list */}
              {currentTabPresets.length === 0 ? (
                <Box
                  direction="Column"
                  gap="200"
                  alignItems="Center"
                  style={{ padding: '32px', color: 'var(--cpd-color-text-secondary)' }}
                >
                  <Icon src={Icons.Setting} size="400" />
                  <Text size="T200">No presets for this room type yet.</Text>
                  {canManage && (
                    <Button
                      size="300"
                      variant="Secondary"
                      radii="300"
                      before={<Icon src={Icons.Plus} size="100" />}
                      onClick={() => setEditingPreset('new')}
                    >
                      <Text size="B300">Create one</Text>
                    </Button>
                  )}
                </Box>
              ) : (
                <Box direction="Column" gap="300">
                  {currentTabPresets.map((preset) => (
                    <SequenceCard
                      key={preset.id}
                      variant="SurfaceVariant"
                      className={SequenceCardStyle}
                      direction="Column"
                      gap="300"
                    >
                      <SettingTile
                        before={<Icon src={Icons.Bookmark} size="200" />}
                        title={preset.name}
                        description={preset.description}
                        after={
                          <Box gap="100" shrink="No">
                            {preset.powerLevelTags &&
                              Object.keys(preset.powerLevelTags).length > 0 && (
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
                            {preset.permissions &&
                              Object.keys(preset.permissions).length > 0 && (
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
                          Updated {new Date(preset.updatedAt).toLocaleDateString()}
                        </Text>
                        <Box gap="200" wrap="Wrap">
                          {canManage && (
                            <>
                              <Button
                                size="300"
                                variant="Secondary"
                                radii="300"
                                before={<Icon src={Icons.Pencil} size="100" />}
                                onClick={() => setEditingPreset(preset)}
                              >
                                <Text size="B300">Edit</Text>
                              </Button>
                              <Button
                                size="300"
                                variant="Secondary"
                                radii="300"
                                before={<Icon src={Icons.ArrowTop} size="100" />}
                                onClick={() => {
                                  setApplyingPreset(preset);
                                  setSelectedRooms(new Set());
                                  setApplyStage('select-rooms');
                                }}
                              >
                                <Text size="B300">Apply to Rooms</Text>
                              </Button>
                            </>
                          )}
                          <Button
                            size="300"
                            variant="Secondary"
                            radii="300"
                            before={<Icon src={Icons.ArrowGoRight} size="100" />}
                            onClick={() => handlePushToAccount(preset)}
                          >
                            <Text size="B300">Save to Account</Text>
                          </Button>
                          {canManage && (
                            <Button
                              size="300"
                              variant="Secondary"
                              radii="300"
                              before={<Icon src={Icons.Cross} size="100" />}
                              onClick={() => handleDeletePreset(preset.id)}
                              disabled={deleteState.status === AsyncStatus.Loading}
                            >
                              <Text size="B300">Delete</Text>
                            </Button>
                          )}
                        </Box>
                      </Box>
                    </SequenceCard>
                  ))}
                </Box>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
