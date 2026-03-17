import { useMemo } from 'react';
import { useAccountData } from './useAccountData';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { RoomTemplatesContent } from '../../types/matrix/roomTemplates';

export function useAccountRoomTemplates(): RoomTemplatesContent {
  const event = useAccountData(AccountDataEvent.RoomTemplates);

  return useMemo(() => {
    const content = event?.getContent<RoomTemplatesContent>();
    if (!content || !Array.isArray(content.presets)) return { presets: [] };
    return content;
  }, [event]);
}
