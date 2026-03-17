import React, { useCallback, useState } from 'react';
import { Box, Chip, Icon, IconButton, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useRoom } from '../../../hooks/useRoom';
import { usePowerLevels } from '../../../hooks/usePowerLevels';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { StateEvent, RoomType } from '../../../../types/matrix/room';
import { usePermissionGroups } from './usePermissionItems';
import { PermissionGroups, Powers, PowersEditor, PresetApplyFlow, SaveToPresetFlow } from '../../common-settings/permissions';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { useSpaceRoomPresets } from '../../../hooks/useSpaceRoomPresets';
import { useAccountRoomPresets } from '../../../hooks/useAccountRoomPresets';
import { PermissionLocation, IPowerLevels } from '../../../hooks/usePowerLevels';
import { PowerLevelTags } from '../../../hooks/usePowerLevelTags';
import { useAtomValue } from 'jotai';
import { roomToParentsAtom } from '../../../state/room/roomToParents';

type PermissionsProps = {
  requestClose: () => void;
};
export function Permissions({ requestClose }: PermissionsProps) {
  const mx = useMatrixClient();
  const room = useRoom();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const roomToParents = useAtomValue(roomToParentsAtom);

  const permissions = useRoomPermissions(creators, powerLevels);

  const canEditPowers = permissions.stateEvent(StateEvent.PowerLevelTags, mx.getSafeUserId());
  const canEditPermissions = permissions.stateEvent(StateEvent.RoomPowerLevels, mx.getSafeUserId());
  const permissionGroups = usePermissionGroups();

  const [powerEditor, setPowerEditor] = useState(false);
  const [applyPresetMode, setApplyPresetMode] = useState(false);
  const [savePresetMode, setSavePresetMode] = useState(false);
  const [presetChanges, setPresetChanges] = useState<Map<PermissionLocation, number> | undefined>();
  const [presetTagsToSave, setPresetTagsToSave] = useState<PowerLevelTags | undefined>();

  // Find parent space (if this space is nested inside another space)
  const parentSpaceId = Array.from(roomToParents.get(room.roomId) ?? []).find((id) => {
    const r = mx.getRoom(id);
    return r?.getType() === RoomType.Space;
  });
  const parentSpace = parentSpaceId ? mx.getRoom(parentSpaceId) ?? undefined : undefined;
  const ownSpacePresets = useSpaceRoomPresets(room);
  const parentSpacePresets = useSpaceRoomPresets(parentSpace);
  const accountPresets = useAccountRoomPresets();

  const handlePresetApply = useCallback(
    (resolvedTags: PowerLevelTags | undefined, changes: Map<PermissionLocation, number>) => {
      setPresetTagsToSave(resolvedTags);
      setPresetChanges(changes);
      setApplyPresetMode(false);
    },
    []
  );

  const handlePresetReset = useCallback(() => {
    setPresetTagsToSave(undefined);
    setPresetChanges(undefined);
  }, []);

  const handleCombinedApply = useCallback(
    async (editedPowerLevels: IPowerLevels) => {
      if (presetTagsToSave) {
        await mx.sendStateEvent(room.roomId, StateEvent.PowerLevelTags as any, presetTagsToSave);
      }
      await mx.sendStateEvent(room.roomId, StateEvent.RoomPowerLevels as any, editedPowerLevels);
      setPresetTagsToSave(undefined);
      setPresetChanges(undefined);
    },
    [mx, room.roomId, presetTagsToSave]
  );

  if (canEditPowers && powerEditor) {
    return <PowersEditor powerLevels={powerLevels} requestClose={() => setPowerEditor(false)} />;
  }

  if (applyPresetMode) {
    return (
      <PresetApplyFlow
        room={room}
        permissionGroups={permissionGroups}
        spacePresets={ownSpacePresets}
        accountPresets={accountPresets}
        onApply={handlePresetApply}
        onCancel={() => setApplyPresetMode(false)}
      />
    );
  }

  if (savePresetMode) {
    return (
      <SaveToPresetFlow
        room={room}
        powerLevels={powerLevels}
        permissionGroups={permissionGroups}
        ownSpace={room}
        ownSpacePresetsContent={ownSpacePresets}
        parentSpace={parentSpace}
        spacePresetsContent={parentSpacePresets}
        accountPresetsContent={accountPresets}
        onSave={() => setSavePresetMode(false)}
        onCancel={() => setSavePresetMode(false)}
      />
    );
  }

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Permissions
            </Text>
          </Box>
          <Box shrink="No" gap="200" alignItems="Center">
            <Chip
              variant="Secondary"
              fill="Soft"
              radii="Pill"
              before={<Icon src={Icons.Bookmark} size="50" />}
              onClick={() => setSavePresetMode(true)}
            >
              <Text size="B300">Save as Preset</Text>
            </Chip>
            {canEditPermissions && (
              <Chip
                variant={presetChanges ? 'Success' : 'Secondary'}
                outlined={!!presetChanges}
                fill="Soft"
                radii="Pill"
                before={<Icon src={Icons.Download} size="50" />}
                onClick={() => setApplyPresetMode(true)}
              >
                <Text size="B300">Apply Preset</Text>
              </Chip>
            )}
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Powers
                powerLevels={powerLevels}
                onEdit={canEditPowers ? () => setPowerEditor(true) : undefined}
                permissionGroups={permissionGroups}
                overrideTags={presetTagsToSave}
                presetTagsNotice={!!presetTagsToSave}
              />
              <PermissionGroups
                canEdit={canEditPermissions}
                powerLevels={powerLevels}
                permissionGroups={permissionGroups}
                presetChanges={presetChanges}
                onApply={presetTagsToSave ? handleCombinedApply : undefined}
                hasPendingTags={!!presetTagsToSave}
                onReset={presetTagsToSave || presetChanges ? handlePresetReset : undefined}
              />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
