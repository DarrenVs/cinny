import { useMemo } from 'react';
import { useAccountData } from './useAccountData';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { RoomPresetsContent } from '../../types/matrix/roomPresets';

export function useAccountRoomPresets(): RoomPresetsContent {
  const event = useAccountData(AccountDataEvent.RoomPresets);

  return useMemo(() => {
    const content = event?.getContent<RoomPresetsContent>();
    if (!content || !Array.isArray(content.presets)) return { presets: [] };
    return content;
  }, [event]);
}
