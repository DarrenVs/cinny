import { Room } from 'matrix-js-sdk';
import { useMemo } from 'react';
import { useStateEvent } from './useStateEvent';
import { StateEvent } from '../../types/matrix/room';
import { RoomPresetsContent } from '../../types/matrix/roomPresets';

const EMPTY: RoomPresetsContent = { presets: [] };

// Accepts undefined so callers don't need to guard against missing space
export function useSpaceRoomPresets(space: Room | undefined): RoomPresetsContent {
  const dummyRoom = useMemo(() => ({ roomId: '', getType: () => undefined } as unknown as Room), []);
  const event = useStateEvent(space ?? dummyRoom, StateEvent.SpaceRoomPresets as any);

  return useMemo(() => {
    if (!space) return EMPTY;
    const content = event?.getContent<RoomPresetsContent>();
    if (!content || !Array.isArray(content.presets)) return EMPTY;
    return content;
  }, [space, event]);
}
