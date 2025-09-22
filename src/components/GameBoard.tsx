"use client";

import { useRoom } from "@/contexts/RoomContext";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScoreTable } from "./ScoreTable";
import { toast } from "sonner";
import { Dice } from "./button/Dice";

export function GameBoard() {
  const {
    gameStarted,
    countdown,
    users,
    nick,
    scores,
    turnIndex,
    roomId,
    dice,
    rollsLeft,
  } = useRoom();

  const turnPlayer = users[turnIndex % users.length]?.nick;
  const notMyTurn = turnPlayer !== nick;

  const handleUpdateScores = async (
    newScores: Record<string, number | null>,
    category: string
  ) => {
    try {
      await fetch("/api/game/select-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          nick,
          scores: newScores,
          lastSelected: category,
        }),
      });
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
      <CardContent className="flex-1 space-y-6">
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
            <Dice disabled={rollsLeft === 0 || notMyTurn} />

            {/* 점수판 */}
            <ScoreTable
              scores={scores[turnPlayer]}
              dice={dice.map((d) => d.value)}
              onUpdate={handleUpdateScores}
              disabled={notMyTurn}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
