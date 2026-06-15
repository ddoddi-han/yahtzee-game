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
  const [hasOlderMessages, setHasOlderMessages] = React.useState(false);
  const [historyMessages, setHistoryMessages] = React.useState<RoomMessage[]>([]);
  const hasLoadedInitialHistory = React.useRef(false);

  const messages = React.useMemo(
    () => mergeRoomMessages(historyMessages, liveMessages),
    [historyMessages, liveMessages]
  );

  const loadHistoryPage = React.useCallback(
    async (before?: string) => {
      const page = await loadChatHistory({
        roomId,
        before,
        limit: 30,
      });

      setHistoryMessages(current => mergeRoomMessages(page.nodes, current));
      setHistoryCursor(page.pageInfo.endCursor);
      setHasOlderMessages(page.pageInfo.hasNextPage);
    },
    [roomId]
  );

  React.useEffect(() => {
    if (hasLoadedInitialHistory.current) return;

    let cancelled = false;

    loadHistoryPage()
      .then(() => {
        if (!cancelled) hasLoadedInitialHistory.current = true;
      })
      .catch(() => {
        if (!cancelled) setHasOlderMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadHistoryPage]);

  const loadOlderMessages = React.useCallback(async () => {
    await loadHistoryPage(historyCursor ?? undefined);
  }, [historyCursor, loadHistoryPage]);

  return {
    messages,
    hasOlderMessages,
    loadOlderMessages,
  };
}
