"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
import { PlayerList } from "@/components/PlayerList";
import { RoomContextType, RoomProvider } from "@/providers/room-provider";
import { Button } from "@/components/ui/button";
import { GameBoard } from "@/components/GameBoard";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  const [nick, setNick] = React.useState<RoomContextType["nick"]>("");

  React.useEffect(() => {
    const savedNick = localStorage.getItem("chat_nick");
    if (savedNick) {
      setNick(savedNick);
    } else {
      // 닉네임 없으면 다시 입장 페이지로
      router.replace("/");
    }
  }, [router]);

  if (!nick) return null;

  return (
    <RoomProvider roomId={roomId} nick={nick}>
      <main className="grid grid-cols-[7fr_3fr] h-full gap-6 p-4 md:p-8">
        <GameBoard />

        <div className="flex flex-col h-full min-h-0 gap-6">
          <div className="grid grid-rows-[7fr_3fr] flex-1 min-h-0 gap-6">
            <ChatRoom />
            <PlayerList />
          </div>
          <Button
            variant="destructive"
            onClick={async () => {
              const nick = localStorage.getItem("chat_nick");
              if (nick) {
                await fetch("/api/game/exit", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ roomId, nick }),
                });
              }
              localStorage.removeItem("chat_nick");
              router.push("/");
            }}
          >
            나가기
          </Button>
        </div>
      </main>
    </RoomProvider>
  );
}
