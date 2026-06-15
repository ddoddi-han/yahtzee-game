'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChatRoom } from '@/components/ChatRoom';
import { PlayerList } from '@/components/PlayerList';
import { RoomProvider, useRoomActions } from '@/providers/room-provider';
import { Button } from '@/components/ui/button';
import { GameBoard } from '@/components/GameBoard';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  const [nick] = React.useState<string>(() =>
    typeof window === 'undefined' ? '' : (localStorage.getItem('chat_nick') ?? '')
  );

  React.useEffect(() => {
    if (!nick) {
      router.replace('/');
    }
  }, [nick, router]);

  if (!nick) return null;

  return (
    <RoomProvider roomId={roomId} nick={nick}>
      <main className="grid h-full grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)] lg:gap-6 lg:p-8">
        <GameBoard />

        <div className="flex min-h-0 flex-col gap-6 lg:h-full">
          <div className="grid min-h-130 flex-1 grid-rows-[7fr_3fr] gap-6 lg:min-h-0">
            <ChatRoom />
            <PlayerList />
          </div>
          <LeaveRoomButton />
        </div>
      </main>
    </RoomProvider>
  );
}

function LeaveRoomButton() {
  const router = useRouter();
  const { exitRoom } = useRoomActions();

  return (
    <Button
      variant="destructive"
      onClick={async () => {
        await exitRoom();
        localStorage.removeItem('chat_nick');
        router.push('/');
      }}
    >
      나가기
    </Button>
  );
}
