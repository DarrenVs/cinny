import { Room } from 'matrix-js-sdk';
import { useMemo } from 'react';
import { useStateEvent } from './useStateEvent';
import { StateEvent } from '../../types/matrix/room';
import { RoomPresetsContent } from '../../types/matrix/roomPresets';

const EMPTY: RoomPresetsContent = { presets: [] };

/**
 * A stable dummy Room used when space is undefined. It implements the minimal
 * surface that useStateEvent / getStateEvent need without crashing:
 *  - roomId: empty string so event comparisons never match
 *  - client: no-op on/removeListener so useStateEventCallback is safe
 *  - getLiveTimeline: returns a timeline whose getState() returns null,
 *    so getStateEvent() returns undefined (optional-chained safely)
 */
const DUMMY_ROOM: Room = {
  roomId: '',
  getType: () => undefined,
  client: { on: () => {}, removeListener: () => {} },
  getLiveTimeline: () => ({ getState: () => null }),
} as unknown as Room;

// Accepts undefined so callers don't need to guard against missing space
export function useSpaceRoomPresets(space: Room | undefined): RoomPresetsContent {
  const event = useStateEvent(space ?? DUMMY_ROOM, StateEvent.SpaceRoomPresets as any);

  return useMemo(() => {
    if (!space) return EMPTY;
    const content = event?.getContent<RoomPresetsContent>();
    if (!content || !Array.isArray(content.presets)) return EMPTY;
    return content;
  }, [space, event]);
}
