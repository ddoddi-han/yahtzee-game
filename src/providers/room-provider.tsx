'use client';

import { ScoreCategory } from '@/features/game/domain/categories';
import * as roomClient from '@/features/game/client/room-client';
import { GameSnapshot, RoomMessage, ServerMessage } from '@/features/game/shared/messages';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

type RoomConnectionState = 'connecting' | 'connected' | 'disconnected';

export type RoomContextType = {
  session: {
    roomId: string;
    nick: string;
  };
  connection: {
    state: RoomConnectionState;
  };
  snapshot: GameSnapshot | null;
  messages: RoomMessage[];
};

const RoomContext = React.createContext<RoomContextType | null>(null);

export function RoomProvider({
  roomId,
  nick,
  children,
}: {
  roomId: string;
  nick: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [connectionState, setConnectionState] = React.useState<RoomConnectionState>('connecting');
  const [messages, setMessages] = React.useState<RoomMessage[]>([]);
  const [snapshot, setSnapshot] = React.useState<GameSnapshot | null>(null);

  React.useEffect(() => {
    if (!roomId || !nick) return;

    const url = `/api/sse?room=${encodeURIComponent(roomId)}&nick=${encodeURIComponent(nick)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnectionState('connected');

    es.onmessage = ev => {
      try {
        const data = JSON.parse(ev.data) as ServerMessage;
        if (data.type === 'force-exit') {
          toast.error(data.reason);
          router.push('/');
          es.close();
          return;
        }

        if (data.type === 'snapshot') {
          setSnapshot(data.snapshot);
          return;
        }

        setMessages(prev => [...prev, data]);
      } catch {}
    };

    es.onerror = () => setConnectionState('disconnected');

    return () => es.close();
  }, [roomId, nick, router]);

  const value = React.useMemo<RoomContextType>(
    () => ({
      session: { roomId, nick },
      connection: { state: connectionState },
      snapshot,
      messages,
    }),
    [roomId, nick, connectionState, snapshot, messages]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const ctx = React.useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within a RoomProvider');
  return ctx;
}

export function useRoomSession() {
  return useRoom().session;
}

export function useRoomConnection() {
  return useRoom().connection;
}

export function useRoomSnapshot() {
  return useRoom().snapshot;
}

export function useLiveRoomMessages() {
  return useRoom().messages;
}

export function useGameView() {
  const { nick } = useRoomSession();
  const snapshot = useRoomSnapshot();
  const phase = snapshot?.phase ?? 'lobby';
  const gameStarted = phase === 'playing' || phase === 'finished';
  const turnNick = snapshot?.turnNick ?? null;

  return {
    snapshot,
    phase,
    gameStarted,
    countdown: snapshot?.countdown ?? null,
    turnNick,
    notMyTurn: turnNick !== nick,
    users: snapshot?.users ?? [],
    dice: snapshot?.dice ?? [],
    rollsLeft: snapshot?.rollsLeft ?? 3,
    result: snapshot?.result ?? null,
    scores: snapshot?.scores ?? {},
  };
}

export function useRoomActions() {
  const { roomId, nick } = useRoomSession();

  return React.useMemo(
    () => ({
      rollDice: () => roomClient.rollDice({ roomId, nick }),
      toggleHold: (index: number) => roomClient.toggleHold({ roomId, nick, index }),
      selectScore: (category: ScoreCategory) => roomClient.selectScore({ roomId, nick, category }),
      restartRoom: () => roomClient.restartRoom({ roomId, nick }),
      exitRoom: () => roomClient.exitRoom({ roomId, nick }),
      setReady: (ready: boolean) => roomClient.setReady({ roomId, nick, ready }),
      sendChat: (text: string) => roomClient.sendChat({ roomId, nick, text }),
    }),
    [roomId, nick]
  );
}
