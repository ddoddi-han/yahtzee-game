'use client';

import * as React from 'react';
import { useLiveRoomMessages, useRoomSession } from '@/providers/room-provider';
import { RoomMessage } from '../shared/messages';
import { loadChatHistory } from './chat-client';

export function mergeRoomMessages(history: RoomMessage[], live: RoomMessage[]) {
  const byId = new Map<string, RoomMessage>();

  for (const message of [...history].reverse()) {
    byId.set(message.id, message);
  }
  for (const message of live) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function useRoomMessages() {
  const { roomId } = useRoomSession();
  const liveMessages = useLiveRoomMessages();
  const [historyCursor, setHistoryCursor] = React.useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = React.useState(true);
  const [historyMessages, setHistoryMessages] = React.useState<RoomMessage[]>([]);

  const messages = React.useMemo(
    () => mergeRoomMessages(historyMessages, liveMessages),
    [historyMessages, liveMessages]
  );

  const loadOlderMessages = React.useCallback(async () => {
    const page = await loadChatHistory({
      roomId,
      before: historyCursor ?? undefined,
      limit: 30,
    });

    setHistoryMessages(current => mergeRoomMessages(page.nodes, current));
    setHistoryCursor(page.pageInfo.endCursor);
    setHasOlderMessages(page.pageInfo.hasNextPage);
  }, [roomId, historyCursor]);

  return {
    messages,
    hasOlderMessages,
    loadOlderMessages,
  };
}
