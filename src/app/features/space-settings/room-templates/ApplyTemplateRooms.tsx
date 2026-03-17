import React, { useMemo } from 'react';
import { Avatar, Box, Text, Checkbox, Icon, Icons } from 'folds';
import { Room } from 'matrix-js-sdk';
import { IPowerLevels } from '../../../hooks/usePowerLevels';
import { SpaceHierarchy } from '../../../hooks/useSpaceHierarchy';
import { RoomAvatar, RoomIcon } from '../../../components/room-avatar';
import { RoomTemplate, TemplateApplicationStatus } from '../../../../types/matrix/roomTemplates';
import { getTemplateApplicationStatus } from '../../../utils/roomTemplates';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { getRoomAvatarUrl } from '../../../utils/room';
import { RoomType } from '../../../../types/matrix/room';

type RoomItem = {
  room: Room;
  isSpaceHeader: boolean;
  indented: boolean;
};

type ApplyTemplateRoomsProps = {
  hierarchy: SpaceHierarchy[];
  rootSpaceId: string;
  roomPowerLevels: Map<string, IPowerLevels>;
  canModifyRooms: Map<string, boolean>;
  template: RoomTemplate;
  selectedRooms: Set<string>;
  onSelectionChange: (roomId: string, selected: boolean) => void;
};

function getStatusIcon(status: TemplateApplicationStatus): React.ReactNode {
  switch (status) {
    case 'in-sync':
      return <Icon src={Icons.Check} size="100" />;
    case 'needs-sync':
      return <Icon src={Icons.ArrowTop} size="100" />;
    case 'no-permission':
      return <Icon src={Icons.Lock} size="100" />;
    case 'type-mismatch':
      return <Icon src={Icons.Cross} size="100" />;
    default:
      return null;
  }
}

function getStatusLabel(status: TemplateApplicationStatus): string {
  switch (status) {
    case 'in-sync': return 'Already synced';
    case 'needs-sync': return 'Needs sync';
    case 'no-permission': return 'No permission';
    case 'type-mismatch': return 'Type mismatch';
    default: return '';
  }
}

function getStatusColor(status: TemplateApplicationStatus): string {
  switch (status) {
    case 'in-sync': return 'var(--cpd-color-text-success-primary)';
    case 'needs-sync': return 'var(--cpd-color-text-warning-primary)';
    case 'no-permission':
    case 'type-mismatch': return 'var(--cpd-color-text-critical-primary)';
    default: return 'var(--cpd-color-text-secondary)';
  }
}

export function ApplyTemplateRooms({
  hierarchy,
  rootSpaceId,
  roomPowerLevels,
  canModifyRooms,
  template,
  selectedRooms,
  onSelectionChange,
}: ApplyTemplateRoomsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  // Build a flat ordered list mirroring the Lobby hierarchy:
  // root's direct rooms first (no header), then each sub-space as a header followed by its rooms
  const flatItems = useMemo((): RoomItem[] => {
    const result: RoomItem[] = [];
    hierarchy.forEach(({ space: spaceItem, rooms: roomItems }) => {
      const isRoot = spaceItem.roomId === rootSpaceId;
      if (!isRoot) {
        const spaceRoom = mx.getRoom(spaceItem.roomId);
        if (spaceRoom) result.push({ room: spaceRoom, isSpaceHeader: true, indented: false });
      }
      roomItems?.forEach((item) => {
        const room = mx.getRoom(item.roomId);
        if (room) result.push({ room, isSpaceHeader: false, indented: !isRoot });
      });
    });
    return result;
  }, [hierarchy, rootSpaceId, mx]);

  const roomStatuses = useMemo(
    () =>
      new Map(
        flatItems.map(({ room }) => {
          const pl = roomPowerLevels.get(room.roomId) ?? {};
          const canModify = canModifyRooms.get(room.roomId) ?? false;
          const status = getTemplateApplicationStatus(room, template, pl, canModify);
          return [room.roomId, { status, canModify }];
        })
      ),
    [flatItems, roomPowerLevels, canModifyRooms, template]
  );

  const selectableCount = useMemo(
    () => flatItems.filter(({ room }) => roomStatuses.get(room.roomId)?.status === 'needs-sync').length,
    [flatItems, roomStatuses]
  );

  if (flatItems.length === 0) {
    return (
      <Box
        direction="Column"
        gap="200"
        alignItems="Center"
        style={{ padding: '24px', color: 'var(--cpd-color-text-secondary)' }}
      >
        <Icon src={Icons.Info} size="400" />
        <Text size="T200">No rooms in this space</Text>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="300">
      <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
        {selectedRooms.size} of {selectableCount} selectable rooms selected
      </Text>

      <Box direction="Column" gap="100">
        {flatItems.map(({ room, isSpaceHeader, indented }) => {
          const info = roomStatuses.get(room.roomId);
          const status = info?.status ?? 'type-mismatch';
          const isSelectable = status === 'needs-sync';
          const isSelected = selectedRooms.has(room.roomId);

          return (
            <Box
              key={room.roomId}
              gap="200"
              alignItems="Center"
              style={{
                opacity: isSelectable ? 1 : 0.5,
                cursor: isSelectable ? 'pointer' : 'default',
                padding: '8px',
                paddingLeft: indented ? '32px' : '8px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'var(--cpd-color-bg-subtle-primary)' : undefined,
              }}
              onClick={isSelectable ? () => onSelectionChange(room.roomId, !isSelected) : undefined}
            >
              {isSelectable ? (
                <Checkbox
                  checked={isSelected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectionChange(room.roomId, !isSelected);
                  }}
                />
              ) : (
                <Box style={{ width: '20px' }} />
              )}

              <Avatar size="200" radii="300">
                <RoomAvatar
                  roomId={room.roomId}
                  src={getRoomAvatarUrl(mx, room, 96, useAuthentication)}
                  alt={room.name}
                  renderFallback={() => (
                    <RoomIcon size="200" joinRule={room.getJoinRule()} roomType={room.getType()} />
                  )}
                />
              </Avatar>

              <Box direction="Column" grow="Yes">
                <Text size="T300" truncate>
                  <b>{room.name || '(No name)'}</b>
                </Text>
                <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  {room.getType() === RoomType.Space ? 'Space' : `${room.getJoinedMemberCount()} members`}
                </Text>
              </Box>

              <Box gap="100" alignItems="Center" style={{ color: getStatusColor(status) }}>
                {getStatusIcon(status)}
                <Text size="T200">{getStatusLabel(status)}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
