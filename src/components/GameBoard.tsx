"use client";

import { useRoom } from "@/contexts/RoomContext";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { ScoreTable } from "./ScoreTable";
import { Dices } from "lucide-react";
import { toast } from "sonner";

export type TDice = { value: number | null; held: boolean };

export function GameBoard() {
  const { gameStarted, countdown, users, nick, scores, turnIndex, roomId } =
    useRoom();

  const [dice, setDice] = React.useState<TDice[]>(
    Array(5)
      .fill(null)
      .map(() => ({ value: null, held: false }))
  );
  const [rollsLeft, setRollsLeft] = React.useState(3);

  const turnPlayer = users[turnIndex % users.length]?.nick;

  function rollDice() {
    if (rollsLeft <= 0) return;
    setDice((prev) =>
      prev.map((d) =>
        d.held ? d : { ...d, value: Math.ceil(Math.random() * 6) }
      )
    );
    setRollsLeft((prev) => prev - 1);
  }

  function toggleHold(index: number) {
    setDice((prev) =>
      prev.map((d, i) => (i === index ? { ...d, held: !d.held } : d))
    );
  }

  // 점수 선택 후 서버에 반영
  const handleUpdateScores = async (
    newScores: Record<string, number | null>
  ) => {
    try {
      await fetch("/api/select-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          nick,
          scores: newScores, // 내 점수판만
        }),
      });
      setDice(
        Array(5)
          .fill(null)
          .map(() => ({ value: null, held: false }))
      );
      setRollsLeft(3);
    } catch (err) {
      console.error("점수 업데이트 실패:", err);
      toast.error("점수 업데이트에 실패했습니다.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {gameStarted && turnPlayer && (
            <>
              <span className="text-2xl font-bold text-blue-300">
                {turnPlayer}
              </span>
              님의 차례입니다.
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {!gameStarted ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-2xl">
            {countdown !== null ? (
              <>
                <span className="font-bold text-green-300">{countdown}</span>초
                후 게임을 시작합니다.
              </>
            ) : (
              "플레이어를 기다리는 중입니다..."
            )}
          </div>
        ) : (
          <>
            {/* 주사위 */}
            <div className="flex justify-between items-center">
              <div className="flex gap-3">
                {dice.map((d, i) => (
                  <Button
                    variant={"outline"}
                    key={i}
                    disabled={rollsLeft === 3}
                    onClick={() => toggleHold(i)}
                    className={`w-12 h-12 text-xl ${
                      d.held ? "!bg-muted-foreground" : ""
                    }`}
                  >
                    {d.value}
                  </Button>
                ))}
              </div>

              {/* Roll 버튼 */}
              {turnPlayer === nick && (
                <Button onClick={rollDice} disabled={rollsLeft === 0}>
                  <Dices />
                  주사위 굴리기 ({rollsLeft})
                </Button>
              )}
            </div>

            {/* 점수판 */}
            <div className="flex-1 overflow-auto border rounded-lg p-2">
              <ScoreTable
                scores={scores[nick] ?? {}}
                dice={dice.map((d) => d.value)}
                onUpdate={handleUpdateScores}
                disabled={turnPlayer !== nick}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
