import { Room } from 'matrix-js-sdk';
import { useMemo } from 'react';
import { useStateEvent } from './useStateEvent';
import { StateEvent } from '../../types/matrix/room';
import { RoomTemplatesContent } from '../../types/matrix/roomTemplates';

const EMPTY: RoomTemplatesContent = { presets: [] };

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
export function useSpaceRoomTemplates(space: Room | undefined): RoomTemplatesContent {
  const event = useStateEvent(space ?? DUMMY_ROOM, StateEvent.SpaceRoomTemplates as any);

  return useMemo(() => {
    if (!space) return EMPTY;
    const content = event?.getContent<RoomTemplatesContent>();
    if (!content || !Array.isArray(content.presets)) return EMPTY;
    return content;
  }, [space, event]);
}
