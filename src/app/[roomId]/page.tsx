"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
import { PlayerList } from "@/components/PlayerList";
import { RoomProvider } from "@/contexts/RoomContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GameBoard } from "@/components/GameBoard";
// import { GameBoard } from "@/components/GameBoard"; // 나중에 붙일 예정

type Message =
  | { type: "system"; text: string; at: number }
  | { type: "chat"; nick: string; text: string; at: number }
  | { type: "users"; users: { nick: string; ready: boolean }[] }
  | {
      type: "game";
      event: "start-countdown" | "start" | "state";
      started?: boolean;
      countdown?: number | null;
    }
  | { type: "force-exit"; reason: string };

export type ChatMessage = {
  type: "system" | "chat";
  text?: string;
  nick?: string;
  at: number;
};

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [nick, setNick] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [users, setUsers] = React.useState<{ nick: string; ready: boolean }[]>(
    []
  );
  const [connected, setConnected] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [gameStarted, setGameStarted] = React.useState(false);

  React.useEffect(() => {
    const savedNick = localStorage.getItem("chat_nick");
    if (savedNick) {
      setNick(savedNick);
    } else {
      // 닉네임 없으면 다시 입장 페이지로
      router.replace("/");
    }
  }, [router]);

  React.useEffect(() => {
    if (!roomId || !nick) return;

    const url = `/api/sse?room=${encodeURIComponent(
      roomId
    )}&nick=${encodeURIComponent(nick)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as Message;
        if (data.type === "force-exit") {
          toast.error("다른 탭에서 접속하여 연결이 종료되었습니다.");
          router.push("/");
          es.close();
          return;
        }

        if (data.type === "users") {
          setUsers(data.users);
        } else if (data.type === "game") {
          if (data.event === "state") {
            setGameStarted(!!data.started);
            setCountdown(data.countdown ?? null);
          } else if (data.event === "start-countdown") {
            setCountdown(data.countdown ?? null);
          } else if (data.event === "start") {
            setGameStarted(true);
            setCountdown(null);
          }
        } else {
          setMessages((prev) => [...prev, data]);
        }
      } catch {}
    };
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [roomId, nick]);

  if (!nick) return null;

  return (
    <RoomProvider
      value={{
        roomId,
        nick,
        connected,
        messages,
        users,
        gameStarted,
        countdown,
      }}
    >
      <main className="grid grid-cols-[7fr_3fr] h-full gap-6 p-4 md:p-8">
        <GameBoard />

        <div className="flex flex-col h-full min-h-0 gap-6">
          <div className="grid grid-rows-[7fr_3fr] flex-1 min-h-0 gap-6">
            <ChatRoom />
            <PlayerList />
          </div>
          <Button
            variant="destructive"
            onClick={() => {
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
