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
  const [turnNick, setTurnNick] =
    React.useState<RoomContextType["turnNick"]>(null);
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
          // 게임 상태
          if (data.event === "state") {
            const { started, countdown, turnNick, scores, dice, rollsLeft } =
              data;

            if (started !== undefined) setGameStarted(started);
            if (countdown !== undefined) setCountdown(countdown);
            if (turnNick !== undefined) setTurnNick(turnNick);
            if (scores !== undefined) setScores(scores);
            if (dice?.length) setDice(dice);
            if (rollsLeft !== undefined) setRollsLeft(rollsLeft);
          }
          // 게임 시작 카운트다운
          else if (data.event === "start-countdown") {
            const { countdown } = data;

            if (countdown !== undefined) setCountdown(countdown);
          }
          // 게임 시작
          else if (data.event === "start") {
            const { turnNick, dice, rollsLeft, scores } = data;

            setGameStarted(true);
            setCountdown(null);
            if (turnNick !== undefined) setTurnNick(turnNick);
            if (dice?.length) setDice(dice);
            if (rollsLeft !== undefined) setRollsLeft(rollsLeft);
            if (scores !== undefined) setScores(scores);
          }
          // 점수 업데이트
          else if (data.event === "update-scores") {
            const { scores, nick, lastSelected } = data;

            if (scores) setScores(scores);
            if (nick && lastSelected) {
              if (lastSelected === "보너스 (+35)") {
                const text = `🎉 ${nick}님이 ${lastSelected}를 달성했습니다!`;
                toast.success(text);
              } else {
                const text = `${nick}님이 ${lastSelected}를 선택했습니다.`;
                toast.success(text);
              }
            }
          }
          // 턴 넘김
          else if (data.event === "update-turn") {
            const { turnNick, dice, rollsLeft, users } = data;

            if (turnNick !== undefined) {
              toast.info(`${turnNick}님의 턴입니다.`);
              setTurnNick(turnNick);
            }
            if (dice?.length) setDice(dice);
            if (rollsLeft !== undefined) setRollsLeft(rollsLeft);
            if (users?.length) setUsers(users);
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
        turnNick,
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
