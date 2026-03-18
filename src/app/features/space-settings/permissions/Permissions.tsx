import React, { useCallback, useState } from 'react';
import { Box, Chip, Icon, IconButton, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useRoom } from '../../../hooks/useRoom';
import { usePowerLevels } from '../../../hooks/usePowerLevels';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { StateEvent, RoomType } from '../../../../types/matrix/room';
import { usePermissionGroups } from './usePermissionItems';
import { PermissionGroups, Powers, PowersEditor, TemplateApplyFlow, SaveToTemplateFlow } from '../../common-settings/permissions';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { useSpaceRoomTemplates } from '../../../hooks/useSpaceRoomTemplates';
import { useAccountRoomTemplates } from '../../../hooks/useAccountRoomTemplates';
import { canManageSpaceTemplates, canManageTemplatesInSpace } from '../../../utils/roomTemplates';
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
  const [applyTemplateMode, setApplyTemplateMode] = useState(false);
  const [saveTemplateMode, setSaveTemplateMode] = useState(false);
  const [templateChanges, setTemplateChanges] = useState<Map<PermissionLocation, number> | undefined>();
  const [templateTagsToSave, setTemplateTagsToSave] = useState<PowerLevelTags | undefined>();

  // Find parent space (if this space is nested inside another space)
  const parentSpaceId = Array.from(roomToParents.get(room.roomId) ?? []).find((id) => {
    const r = mx.getRoom(id);
    return r?.getType() === RoomType.Space;
  });
  const parentSpace = parentSpaceId ? mx.getRoom(parentSpaceId) ?? undefined : undefined;
  const myUserId = mx.getSafeUserId();
  const canSaveToOwnSpace = canManageSpaceTemplates(powerLevels, creators, myUserId);
  const canSaveToParentSpace = canManageTemplatesInSpace(mx, parentSpace, myUserId);

  const ownSpaceTemplates = useSpaceRoomTemplates(room);
  const parentSpaceTemplates = useSpaceRoomTemplates(parentSpace);
  const accountTemplates = useAccountRoomTemplates();

  const handleTemplateApply = useCallback(
    (resolvedTags: PowerLevelTags | undefined, changes: Map<PermissionLocation, number>) => {
      setTemplateTagsToSave(resolvedTags);
      setTemplateChanges(changes);
      setApplyTemplateMode(false);
    },
    []
  );

  const handleTemplateReset = useCallback(() => {
    setTemplateTagsToSave(undefined);
    setTemplateChanges(undefined);
  }, []);

  const handleCombinedApply = useCallback(
    async (editedPowerLevels: IPowerLevels) => {
      if (templateTagsToSave) {
        await mx.sendStateEvent(room.roomId, StateEvent.PowerLevelTags as any, templateTagsToSave);
      }
      await mx.sendStateEvent(room.roomId, StateEvent.RoomPowerLevels as any, editedPowerLevels);
      setTemplateTagsToSave(undefined);
      setTemplateChanges(undefined);
    },
    [mx, room.roomId, templateTagsToSave]
  );

  if (canEditPowers && powerEditor) {
    return <PowersEditor powerLevels={powerLevels} requestClose={() => setPowerEditor(false)} />;
  }

  if (applyTemplateMode) {
    return (
      <TemplateApplyFlow
        room={room}
        permissionGroups={permissionGroups}
        spaceTemplates={ownSpaceTemplates}
        accountTemplates={accountTemplates}
        onApply={handleTemplateApply}
        onCancel={() => setApplyTemplateMode(false)}
      />
    );
  }

  if (saveTemplateMode) {
    return (
      <SaveToTemplateFlow
        room={room}
        powerLevels={powerLevels}
        permissionGroups={permissionGroups}
        ownSpace={canSaveToOwnSpace ? room : undefined}
        ownSpaceTemplatesContent={canSaveToOwnSpace ? ownSpaceTemplates : undefined}
        parentSpace={canSaveToParentSpace ? parentSpace : undefined}
        spaceTemplatesContent={canSaveToParentSpace ? parentSpaceTemplates : undefined}
        accountTemplatesContent={accountTemplates}
        onSave={() => setSaveTemplateMode(false)}
        onCancel={() => setSaveTemplateMode(false)}
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
              before={<Icon src={Icons.File} size="50" />}
              onClick={() => setSaveTemplateMode(true)}
            >
              <Text size="B300">Save as Blueprint</Text>
            </Chip>
            {canEditPermissions && (
              <Chip
                variant={templateChanges ? 'Success' : 'Secondary'}
                outlined={!!templateChanges}
                fill="Soft"
                radii="Pill"
                before={<Icon src={Icons.Download} size="50" />}
                onClick={() => setApplyTemplateMode(true)}
              >
                <Text size="B300">Apply Blueprint</Text>
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
                overrideTags={templateTagsToSave}
                templateTagsNotice={!!templateTagsToSave}
              />
              <PermissionGroups
                canEdit={canEditPermissions}
                powerLevels={powerLevels}
                permissionGroups={permissionGroups}
                templateChanges={templateChanges}
                onApply={templateTagsToSave ? handleCombinedApply : undefined}
                hasPendingTags={!!templateTagsToSave}
                onReset={templateTagsToSave || templateChanges ? handleTemplateReset : undefined}
              />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
