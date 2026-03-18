import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { MatrixClient, Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSpaceHierarchy } from '../../hooks/useSpaceHierarchy';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { stopPropagation } from '../../utils/keyboard';
import { withRateLimitRetry, classifyMatrixError } from '../../utils/matrix';
import { IPowerLevels, readPowerLevel } from '../../hooks/usePowerLevels';
import { DEFAULT_TAGS, getPowerLevelTag, PowerLevelTags } from '../../hooks/usePowerLevelTags';
import { MemberPowerTag, Membership, StateEvent } from '../../../types/matrix/room';
import { PowerColorBadge } from '../power';
import { RoomAvatar, RoomIcon } from '../room-avatar';
import { getStateEvent, getRoomAvatarUrl } from '../../utils/room';
import { getRoomCreatorsForRoomId } from '../../hooks/useRoomCreators';

// ── helpers ───────────────────────────────────────────────────────────────────

const FALLBACK_POWER_LEVELS: IPowerLevels = {
  users_default: 0,
  state_default: 50,
  events_default: 0,
  events: {},
  users: {},
};

function getRoomPowerLevels(room: Room): IPowerLevels {
  const ev = getStateEvent(room, StateEvent.RoomPowerLevels);
  const content = ev?.getContent<IPowerLevels>();
  if (!content) return FALLBACK_POWER_LEVELS;
  return { ...FALLBACK_POWER_LEVELS, ...content };
}

function getRoomAllTags(room: Room): PowerLevelTags {
  const ev = getStateEvent(room, StateEvent.PowerLevelTags);
  const custom = ev?.getContent<PowerLevelTags>() ?? {};
  return { ...DEFAULT_TAGS, ...custom };
}

function findTagByName(
  allTags: PowerLevelTags,
  name: string
): { power: number; tag: MemberPowerTag } | undefined {
  for (const [powerStr, tag] of Object.entries(allTags)) {
    const power = parseInt(powerStr, 10);
    if (!Number.isNaN(power) && tag.name?.toLowerCase() === name.toLowerCase()) {
      return { power, tag };
    }
  }
  return undefined;
}

function canChangePowerInRoom(
  mx: MatrixClient,
  room: Room,
  myUserId: string,
  targetUserId: string
): boolean {
  const creators = getRoomCreatorsForRoomId(mx, room.roomId);
  // Creators bypass all permission checks (same logic as useRoomPermissions)
  if (creators.has(myUserId)) return true;
  // Target is a creator — cannot demote them
  if (creators.has(targetUserId)) return false;

  const powerLevels = getRoomPowerLevels(room);
  const myPower = readPowerLevel.user(powerLevels, myUserId);
  const targetPower = readPowerLevel.user(powerLevels, targetUserId);
  const required = readPowerLevel.state(powerLevels, StateEvent.RoomPowerLevels);
  return myPower >= required && myPower > targetPower;
}

// ── types ─────────────────────────────────────────────────────────────────────

type BroadcastCandidate = {
  room: Room;
  indented: boolean;
  newPower: number;
  newTag: MemberPowerTag;
  currentTagName: string;
  alreadySet: boolean;
  canChange: boolean;
  isPresent: boolean;
  /** Set when the room is structurally incompatible — shown disabled with this reason. */
  disabledReason?: string;
};

type RoomApplyResult = 'success' | { error: string };

type BroadcastPowerChangeDialogProps = {
  space: Room;
  sourceRoom: Room;
  userId: string;
  tagName: string;
  onClose: () => void;
};

// ── component ─────────────────────────────────────────────────────────────────

export function BroadcastPowerChangeDialog({
  space,
  sourceRoom,
  userId,
  tagName,
  onClose,
}: BroadcastPowerChangeDialogProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const myUserId = mx.getSafeUserId();

  const spaceRooms = useMemo(() => {
    const set = new Set<string>();
    mx.getRooms().forEach((r) => {
      if (r.isSpaceRoom()) set.add(r.roomId);
    });
    return set;
  }, [mx]);
  const getRoom = useCallback((roomId: string) => mx.getRoom(roomId) ?? undefined, [mx]);
  const closedCategory = useCallback(() => false, []);
  const hierarchy = useSpaceHierarchy(space.roomId, spaceRooms, getRoom, closedCategory);

  const candidates = useMemo((): BroadcastCandidate[] => {
    const result: BroadcastCandidate[] = [];

    const processRoom = (room: Room, indented: boolean) => {
      if (room.roomId === sourceRoom.roomId) return;
      const member = room.getMember(userId);
      if (!member) return;
      const { membership } = member;
      if (membership !== Membership.Join && membership !== Membership.Leave) return;

      const allTags = getRoomAllTags(room);
      const matched = findTagByName(allTags, tagName);

      const powerLevels = getRoomPowerLevels(room);
      const currentPower = readPowerLevel.user(powerLevels, userId);
      const currentTag = getPowerLevelTag(allTags, currentPower);

      if (!matched) {
        result.push({
          room,
          indented,
          newPower: 0,
          newTag: {},
          currentTagName: currentTag.name ?? `Level ${currentPower}`,
          alreadySet: false,
          canChange: false,
          isPresent: membership === Membership.Join,
          disabledReason: 'Label not configured',
        });
        return;
      }

      result.push({
        room,
        indented,
        newPower: matched.power,
        newTag: matched.tag,
        currentTagName: currentTag.name ?? `Level ${currentPower}`,
        alreadySet: currentPower === matched.power,
        canChange: canChangePowerInRoom(mx, room, myUserId, userId),
        isPresent: membership === Membership.Join,
      });
    };

    hierarchy.forEach(({ space: spaceItem, rooms: roomItems }) => {
      const isRoot = spaceItem.roomId === space.roomId;
      const spaceRoom = mx.getRoom(spaceItem.roomId);
      if (spaceRoom) processRoom(spaceRoom, !isRoot);
      roomItems?.forEach((item) => {
        const room = mx.getRoom(item.roomId);
        if (room) processRoom(room, !isRoot);
      });
    });

    return result;
  }, [hierarchy, space.roomId, sourceRoom.roomId, userId, tagName, mx, myUserId]);

  // Start empty — populated by the layout effect below once candidates are ready.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Run once when candidates first arrive (hierarchy is sync, so this is before first paint).
  // Using a ref guard so user-modified selections aren't reset if candidates later update.
  const initializedRef = useRef(false);
  useLayoutEffect(() => {
    // hierarchy.length === 0 means the root space hasn't been resolved yet (shouldn't
    // happen in practice since useSpaceHierarchy initialises synchronously, but guard anyway).
    if (hierarchy.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    if (candidates.every((c) => c.alreadySet)) {
      onClose();
      return;
    }

    setSelected(() => {
      const s = new Set<string>();
      candidates.forEach((c) => {
        if (c.canChange && !c.alreadySet) s.add(c.room.roomId);
      });
      return s;
    });
  }, [hierarchy.length, candidates, onClose]);

  const toggleRoom = (roomId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });

  // Per-room apply results — populated after apply, empty while idle.
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyResults, setApplyResults] = useState<Map<string, RoomApplyResult>>(new Map());
  const hasResults = applyResults.size > 0;
  const hasErrors = hasResults && [...applyResults.values()].some((r: RoomApplyResult) => r !== 'success');

  const apply = useCallback(async () => {
    setApplying(true);
    setApplyProgress(0);
    const results = new Map<string, RoomApplyResult>();

    // Re-check canChange at call time to catch stale permission snapshots.
    const toApply = candidates.filter(
      (c) => selected.has(c.room.roomId) && canChangePowerInRoom(mx, c.room, myUserId, userId)
    );

    for (let i = 0; i < toApply.length; i += 1) {
      const c = toApply[i];
      try {
        await withRateLimitRetry(() => mx.setPowerLevel(c.room.roomId, userId, c.newPower));
        results.set(c.room.roomId, 'success');
      } catch (e) {
        results.set(c.room.roomId, { error: classifyMatrixError(e) });
      }
      setApplyProgress(i + 1);
      // Small delay between state-event writes to avoid bursting the homeserver rate limit.
      if (i < toApply.length - 1) {
        await new Promise((resolve) => { setTimeout(resolve, 300); });
      }
    }

    setApplying(false);

    if ([...results.values()].every((r: RoomApplyResult) => r === 'success')) {
      // All succeeded — close as normal.
      onClose();
    } else {
      // At least one failure — stay open so the moderator can see which rooms failed.
      setApplyResults(results);
    }
  }, [candidates, selected, mx, userId, myUserId, onClose]);

  const actionableCount = candidates.filter((c) => c.canChange && !c.alreadySet && !c.disabledReason).length;
  const hasAbsentCandidates = candidates.some((c) => !c.isPresent && !c.alreadySet);

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={{ maxWidth: toRem(480), width: '100%' }}>
            <Header
              style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Broadcast Power Level</Text>
              </Box>
              <IconButton size="300" onClick={onClose} radii="300" disabled={applying}>
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>

            <Box
              direction="Column"
              gap="400"
              style={{ padding: config.space.S400, paddingTop: config.space.S300 }}
            >
              <Text priority="400" size="T300">
                Apply <b>{tagName}</b> to{' '}
                <b>{mx.getUser(userId)?.displayName ?? userId}</b> across rooms in{' '}
                <b>{space.name ?? space.roomId}</b> that share the same label.
              </Text>

              {hasAbsentCandidates && (
                <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  Rooms marked <i>Not in room</i> will have the change stored — it takes effect
                  when the user rejoins.
                </Text>
              )}

              {candidates.length === 0 ? (
                <Box
                  direction="Column"
                  gap="200"
                  alignItems="Center"
                  style={{ padding: '24px', color: 'var(--cpd-color-text-secondary)' }}
                >
                  <Icon src={Icons.Info} size="400" />
                  <Text size="T200">
                    No other rooms in this space have the <b>{tagName}</b> label.
                  </Text>
                </Box>
              ) : hierarchy.length === 0 ? (
                <Box alignItems="Center" justifyContent="Center" style={{ padding: '24px' }}>
                  <Spinner size="400" variant="Secondary" />
                </Box>
              ) : (
                <>
                  {!hasResults && (
                    <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                      {selected.size} of {actionableCount} room{actionableCount === 1 ? '' : 's'}{' '}
                      selected
                    </Text>
                  )}

                  <Scroll style={{ maxHeight: toRem(360) }}>
                    <Box direction="Column" gap="100">
                      {candidates.map((c) => {
                        const isSelected = selected.has(c.room.roomId);
                        const isSelectable = c.canChange && !applying && !hasResults && !c.disabledReason && !c.alreadySet;
                        const result = applyResults.get(c.room.roomId);

                        return (
                          <Box
                            key={c.room.roomId}
                            gap="200"
                            alignItems="Center"
                            style={{
                              padding: '8px',
                              paddingLeft: c.indented ? '32px' : '8px',
                              borderRadius: '6px',
                              cursor: isSelectable ? 'pointer' : 'default',
                              opacity: c.canChange && !c.disabledReason && !c.alreadySet ? 1 : 0.5,
                              backgroundColor:
                                isSelected && !c.alreadySet && !hasResults
                                  ? 'var(--cpd-color-bg-subtle-primary)'
                                  : undefined,
                            }}
                            onClick={
                              isSelectable ? () => toggleRoom(c.room.roomId) : undefined
                            }
                          >
                            {hasResults ? (
                              <Box style={{ width: '20px' }}>
                                {result === 'success' && (
                                  <Icon
                                    src={Icons.Check}
                                    size="200"
                                    style={{ color: 'var(--cpd-color-text-success-primary)' }}
                                  />
                                )}
                                {result && result !== 'success' && (
                                  <Icon
                                    src={Icons.Cross}
                                    size="200"
                                    style={{ color: 'var(--cpd-color-text-critical-primary)' }}
                                  />
                                )}
                              </Box>
                            ) : c.disabledReason || c.alreadySet ? (
                              <Checkbox checked={false} disabled />
                            ) : c.canChange ? (
                              <Checkbox
                                checked={isSelected}
                                disabled={applying}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!applying) toggleRoom(c.room.roomId);
                                }}
                              />
                            ) : (
                              <Box style={{ width: '20px', color: 'var(--cpd-color-text-critical-primary)' }}>
                                <Icon src={Icons.Lock} size="200" />
                              </Box>
                            )}

                            <Avatar size="200" radii="300">
                              <RoomAvatar
                                roomId={c.room.roomId}
                                src={getRoomAvatarUrl(mx, c.room, 96, useAuthentication)}
                                alt={c.room.name}
                                renderFallback={() => (
                                  <RoomIcon
                                    size="200"
                                    joinRule={c.room.getJoinRule()}
                                    roomType={c.room.getType()}
                                  />
                                )}
                              />
                            </Avatar>

                            <Box direction="Column" grow="Yes">
                              <Text size="T300" truncate>
                                <b>{c.room.name || '(No name)'}</b>
                              </Text>
                              {!c.isPresent && (
                                <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                                  Not in room
                                </Text>
                              )}
                            </Box>

                            <Box gap="100" alignItems="Center" shrink="No">
                              {c.disabledReason ? (
                                <Text
                                  size="T200"
                                  style={{ color: 'var(--cpd-color-text-secondary)' }}
                                >
                                  {c.disabledReason}
                                </Text>
                              ) : result && result !== 'success' ? (
                                <Text
                                  size="T200"
                                  style={{ color: 'var(--cpd-color-text-critical-primary)' }}
                                >
                                  {result.error}
                                </Text>
                              ) : c.alreadySet || result === 'success' ? (
                                <>
                                  <PowerColorBadge color={c.newTag.color} />
                                  <Text
                                    size="T200"
                                    style={{ color: 'var(--cpd-color-text-success-primary)' }}
                                  >
                                    {c.alreadySet ? `Already ${c.newTag.name ?? tagName}` : (c.newTag.name ?? tagName)}
                                  </Text>
                                </>
                              ) : c.canChange ? (
                                <>
                                  <Text
                                    size="T200"
                                    style={{ color: 'var(--cpd-color-text-secondary)' }}
                                  >
                                    {c.currentTagName}
                                  </Text>
                                  <Text
                                    size="T200"
                                    style={{ color: 'var(--cpd-color-text-secondary)' }}
                                  >
                                    →
                                  </Text>
                                  <PowerColorBadge color={c.newTag.color} />
                                  <Text size="T200">{c.newTag.name ?? tagName}</Text>
                                </>
                              ) : (
                                <Text
                                  size="T200"
                                  style={{ color: 'var(--cpd-color-text-critical-primary)' }}
                                >
                                  No permission
                                </Text>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Scroll>
                </>
              )}

              {hasErrors && (
                <Text size="T300" style={{ color: 'var(--cpd-color-text-critical-primary)' }}>
                  Some rooms could not be updated. The changes may have been applied to other rooms.
                </Text>
              )}

              {candidates.length > 0 && (
                <>
                  <Line size="300" />
                  <Box gap="200" justifyContent="End">
                    {hasResults ? (
                      <Button variant="Primary" radii="300" onClick={onClose}>
                        <Text size="B300">Done</Text>
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="Secondary"
                          fill="Soft"
                          radii="300"
                          onClick={onClose}
                          disabled={applying}
                        >
                          <Text size="B300">Cancel</Text>
                        </Button>
                        <Button
                          variant="Primary"
                          radii="300"
                          onClick={apply}
                          disabled={applying || selected.size === 0}
                          before={
                            applying ? (
                              <Spinner size="300" variant="Primary" fill="Solid" />
                            ) : undefined
                          }
                        >
                          <Text size="B300">
                            {applying
                              ? `Applying… ${applyProgress} / ${selected.size}`
                              : `Apply to ${selected.size} room${selected.size === 1 ? '' : 's'}`}
                          </Text>
                        </Button>
                      </>
                    )}
                  </Box>
                </>
              )}
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
