import React, { useState } from 'react';
import { Box, Button, Chip, Icon, Icons, Input, Scroll, Spinner, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { IPowerLevels, PermissionLocation } from '../../../hooks/usePowerLevels';
import { usePowerLevelTags } from '../../../hooks/usePowerLevelTags';
import { PermissionGroup } from './types';
import { StateEvent } from '../../../../types/matrix/room';
import { RoomTemplatesContent } from '../../../../types/matrix/roomTemplates';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import {
  createTemplate,
  powerLevelsToTemplatePermissions,
  saveTemplate,
} from '../../../utils/roomTemplates';

type SaveToTemplateFlowProps = {
  room: Room;
  powerLevels: IPowerLevels;
  permissionGroups: PermissionGroup[];
  /** The current space (shown as a save destination when editing space permissions). */
  ownSpace?: Room;
  ownSpaceTemplatesContent?: RoomTemplatesContent;
  /** A parent space (shown as an additional save destination). */
  parentSpace?: Room;
  spaceTemplatesContent?: RoomTemplatesContent;
  accountTemplatesContent: RoomTemplatesContent;
  onSave: () => void;
  onCancel: () => void;
};

type Destination = 'own-space' | 'parent-space' | 'account';

export function SaveToTemplateFlow({
  room,
  powerLevels,
  permissionGroups,
  ownSpace,
  ownSpaceTemplatesContent,
  parentSpace,
  spaceTemplatesContent,
  accountTemplatesContent,
  onSave,
  onCancel,
}: SaveToTemplateFlowProps) {
  const mx = useMatrixClient();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);

  const defaultDestination: Destination = ownSpace
    ? 'own-space'
    : parentSpace
    ? 'parent-space'
    : 'account';

  const [name, setName] = useState(room.name ?? '');
  const [destination, setDestination] = useState<Destination>(defaultDestination);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(undefined);

    try {
      const permissions = powerLevelsToTemplatePermissions(powerLevels, permissionGroups);
      const tags =
        Object.keys(powerLevelTags).length > 0 ? { ...powerLevelTags } : undefined;

      const template = createTemplate({
        name: trimmed,
        roomType: room.getType() ?? null,
        permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        powerLevelTags: tags,
      });

      if (destination === 'own-space' && ownSpace && ownSpaceTemplatesContent) {
        const newContent = saveTemplate(ownSpaceTemplatesContent, template);
        await mx.sendStateEvent(ownSpace.roomId, StateEvent.SpaceRoomTemplates as any, newContent);
      } else if (destination === 'parent-space' && parentSpace && spaceTemplatesContent) {
        const newContent = saveTemplate(spaceTemplatesContent, template);
        await mx.sendStateEvent(
          parentSpace.roomId,
          StateEvent.SpaceRoomTemplates as any,
          newContent
        );
      } else {
        const newContent = saveTemplate(accountTemplatesContent, template);
        await mx.setAccountData(AccountDataEvent.RoomTemplates, newContent);
      }

      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template.');
      setSaving(false);
    }
  };

  const destinationLabel = (() => {
    if (destination === 'own-space' && ownSpace)
      return `Template will be available to all rooms in "${ownSpace.name}".`;
    if (destination === 'parent-space' && parentSpace)
      return `Template will be available to all rooms in "${parentSpace.name}".`;
    return 'Template will be available across all your spaces and rooms.';
  })();

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200" alignItems="Center">
          <Button
            variant="Secondary"
            fill="None"
            size="300"
            radii="300"
            before={<Icon src={Icons.ArrowLeft} size="100" />}
            onClick={onCancel}
          >
            <Text size="B300">Cancel</Text>
          </Button>
          <Box grow="Yes">
            <Text size="H3" truncate>
              Save as Blueprint
            </Text>
          </Box>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="500">
              <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                Save this room&apos;s current permission configuration as a reusable template.
                Power level labels will be included.
              </Text>

              <Box direction="Column" gap="100">
                <Text size="L400">Blueprint Name</Text>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard Chat"
                  size="400"
                  variant="Secondary"
                  radii="300"
                  autoFocus
                />
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">Save To</Text>
                <Box gap="200" wrap="Wrap">
                  <Chip
                    variant={destination === 'account' ? 'Primary' : 'Secondary'}
                    radii="Pill"
                    onClick={() => setDestination('account')}
                    aria-pressed={destination === 'account'}
                    before={<Icon src={Icons.User} size="50" />}
                  >
                    <Text size="B300">My Account</Text>
                  </Chip>
                  {ownSpace && (
                    <Chip
                      variant={destination === 'own-space' ? 'Primary' : 'Secondary'}
                      radii="Pill"
                      onClick={() => setDestination('own-space')}
                      aria-pressed={destination === 'own-space'}
                      before={<Icon src={Icons.File} size="50" />}
                    >
                      <Text size="B300">{ownSpace.name}</Text>
                    </Chip>
                  )}
                  {parentSpace && (
                    <Chip
                      variant={destination === 'parent-space' ? 'Primary' : 'Secondary'}
                      radii="Pill"
                      onClick={() => setDestination('parent-space')}
                      aria-pressed={destination === 'parent-space'}
                      before={<Icon src={Icons.File} size="50" />}
                    >
                      <Text size="B300">{parentSpace.name}</Text>
                    </Chip>
                  )}
                </Box>
                <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  {destinationLabel}
                </Text>
              </Box>

              {error && (
                <Box alignItems="Center" gap="200" style={{ color: 'var(--cpd-color-text-critical-primary)' }}>
                  <Icon src={Icons.Warning} size="100" filled />
                  <Text size="T300">{error}</Text>
                </Box>
              )}

              <Box gap="200" justifyContent="End">
                <Button variant="Secondary" radii="300" onClick={onCancel} disabled={saving}>
                  <Text size="B300">Cancel</Text>
                </Button>
                <Button
                  variant="Primary"
                  radii="300"
                  disabled={!name.trim() || saving}
                  before={saving && <Spinner variant="Primary" fill="Solid" size="100" />}
                  onClick={handleSave}
                >
                  <Text size="B300">Save Blueprint</Text>
                </Button>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
