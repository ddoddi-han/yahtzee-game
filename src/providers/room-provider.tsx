"use client";

import { ServerMessage, TDice, TScores, TUsers } from "@/lib/roomBus";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

export type RoomContextType = {
  roomId: string;
  nick: string;
  connected: boolean;
  messages: {
    type: "system" | "chat";
    text?: string;
    nick?: string;
    at: number;
  }[];
  users: TUsers;
  gameStarted: boolean;
  countdown: number | null;
  scores: Record<string, TScores>;
  turnNick: string | null;
  dice: TDice[];
  rollsLeft: number;
};

const RoomContext = React.createContext<RoomContextType | null>(null);

export function RoomProvider({
  roomId,
  nick,
  children,
}: {
  roomId: RoomContextType["roomId"];
  nick: RoomContextType["nick"];
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [connected, setConnected] =
    React.useState<RoomContextType["connected"]>(false);
  const [messages, setMessages] = React.useState<RoomContextType["messages"]>(
    []
  );
  const [users, setUsers] = React.useState<RoomContextType["users"]>([]);
  const [gameStarted, setGameStarted] =
    React.useState<RoomContextType["gameStarted"]>(false);
  const [countdown, setCountdown] =
    React.useState<RoomContextType["countdown"]>(null);
  const [scores, setScores] = React.useState<RoomContextType["scores"]>({});
  const [turnNick, setTurnNick] =
    React.useState<RoomContextType["turnNick"]>(null);
  const [dice, setDice] = React.useState<RoomContextType["dice"]>([]);
  const [rollsLeft, setRollsLeft] =
    React.useState<RoomContextType["rollsLeft"]>(3);

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
          toast.error(data.reason);
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

  return (
    <RoomContext.Provider
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
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const ctx = React.useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used within a RoomProvider");
  return ctx;
}
