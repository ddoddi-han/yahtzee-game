"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
import { PlayerList } from "@/components/PlayerList";
import { RoomContextType, RoomProvider } from "@/contexts/RoomContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GameBoard } from "@/components/GameBoard";
import { ServerMessage } from "@/lib/roomBus";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  const [nick, setNick] = React.useState<RoomContextType["nick"]>("");
  const [messages, setMessages] = React.useState<RoomContextType["messages"]>(
    []
  );
  const [users, setUsers] = React.useState<RoomContextType["users"]>([]);
  const [connected, setConnected] =
    React.useState<RoomContextType["connected"]>(false);
  const [countdown, setCountdown] =
    React.useState<RoomContextType["countdown"]>(null);
  const [gameStarted, setGameStarted] =
    React.useState<RoomContextType["gameStarted"]>(false);
  const [scores, setScores] = React.useState<RoomContextType["scores"]>({});
  const [turnIndex, setTurnIndex] =
    React.useState<RoomContextType["turnIndex"]>(0);
  const [dice, setDice] = React.useState<RoomContextType["dice"]>([]);
  const [rollsLeft, setRollsLeft] =
    React.useState<RoomContextType["rollsLeft"]>(3);

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
        const data = JSON.parse(ev.data) as ServerMessage;
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
            if (data.scores) setScores(data.scores);
            if (data.turnIndex) setTurnIndex(data.turnIndex);
            if (data.dice) setDice(data.dice);
            if (data.rollsLeft) setRollsLeft(data.rollsLeft);
          } else if (data.event === "start-countdown") {
            setCountdown(data.countdown ?? null);
          } else if (data.event === "start") {
            setGameStarted(true);
            setCountdown(null);
          } else if (data.event === "update-scores") {
            setScores(data.scores ?? {});

            if (data.nick && data.lastSelected) {
              if (data.lastSelected === "보너스 (+35)") {
                toast.success(
                  `🎉 ${data.nick}님이 ${data.lastSelected}를 달성했습니다!`
                );
              } else {
                toast.success(
                  `${data.nick}님이 ${data.lastSelected}를 선택했습니다.`
                );
              }
            }
          } else if (data.event === "update-turn") {
            if (data.turnIndex) {
              setTurnIndex(data.turnIndex);
              const nextPlayer = users[data.turnIndex % users.length]?.nick;
              toast.info(`${nextPlayer}님의 턴입니다.`);
            }
            if (data.dice) setDice(data.dice);
            if (data.rollsLeft) setRollsLeft(data.rollsLeft);
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
        scores,
        turnIndex,
        dice,
        rollsLeft,
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
