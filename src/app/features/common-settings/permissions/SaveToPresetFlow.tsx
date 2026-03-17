import React, { useState } from 'react';
import { Box, Button, Chip, Icon, Icons, Input, Scroll, Spinner, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { IPowerLevels, PermissionLocation } from '../../../hooks/usePowerLevels';
import { usePowerLevelTags } from '../../../hooks/usePowerLevelTags';
import { PermissionGroup } from './types';
import { StateEvent } from '../../../../types/matrix/room';
import { RoomPresetsContent } from '../../../../types/matrix/roomPresets';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import {
  createPreset,
  powerLevelsToPresetPermissions,
  savePreset,
} from '../../../utils/roomPresets';

type SaveToPresetFlowProps = {
  room: Room;
  powerLevels: IPowerLevels;
  permissionGroups: PermissionGroup[];
  parentSpace?: Room;
  spacePresetsContent: RoomPresetsContent;
  accountPresetsContent: RoomPresetsContent;
  onSave: () => void;
  onCancel: () => void;
};

type Destination = 'space' | 'account';

export function SaveToPresetFlow({
  room,
  powerLevels,
  permissionGroups,
  parentSpace,
  spacePresetsContent,
  accountPresetsContent,
  onSave,
  onCancel,
}: SaveToPresetFlowProps) {
  const mx = useMatrixClient();
  const powerLevelTags = usePowerLevelTags(room, powerLevels);

  const [name, setName] = useState(room.name ?? '');
  const [destination, setDestination] = useState<Destination>(
    parentSpace ? 'space' : 'account'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(undefined);

    try {
      const permissions = powerLevelsToPresetPermissions(powerLevels, permissionGroups);
      const tags =
        Object.keys(powerLevelTags).length > 0 ? { ...powerLevelTags } : undefined;

      const preset = createPreset({
        name: trimmed,
        roomType: room.getType() ?? null,
        permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        powerLevelTags: tags,
      });

      if (destination === 'space' && parentSpace) {
        const newContent = savePreset(spacePresetsContent, preset);
        await mx.sendStateEvent(
          parentSpace.roomId,
          StateEvent.SpaceRoomPresets as any,
          newContent
        );
      } else {
        const newContent = savePreset(accountPresetsContent, preset);
        await mx.setAccountData(AccountDataEvent.RoomPresets, newContent);
      }

      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save preset.');
      setSaving(false);
    }
  };

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
              Save as Preset
            </Text>
          </Box>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="500">
              <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                Save this room&apos;s current permission configuration as a reusable preset.
                Power level labels will be included.
              </Text>

              <Box direction="Column" gap="100">
                <Text size="L400">Preset Name</Text>
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
                <Box gap="200">
                  <Chip
                    variant={destination === 'account' ? 'Primary' : 'Secondary'}
                    radii="Pill"
                    onClick={() => setDestination('account')}
                    aria-pressed={destination === 'account'}
                    before={<Icon src={Icons.User} size="50" />}
                  >
                    <Text size="B300">My Account</Text>
                  </Chip>
                  {parentSpace && (
                    <Chip
                      variant={destination === 'space' ? 'Primary' : 'Secondary'}
                      radii="Pill"
                      onClick={() => setDestination('space')}
                      aria-pressed={destination === 'space'}
                      before={<Icon src={Icons.Category} size="50" />}
                    >
                      <Text size="B300">{parentSpace.name}</Text>
                    </Chip>
                  )}
                </Box>
                <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  {destination === 'space' && parentSpace
                    ? `Preset will be available to all rooms in "${parentSpace.name}".`
                    : 'Preset will be available across all your spaces and rooms.'}
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
                  <Text size="B300">Save Preset</Text>
                </Button>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
