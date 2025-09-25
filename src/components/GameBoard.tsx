"use client";

import { useRoom } from "@/providers/room-provider";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { getTurnNumber, ScoreTable } from "./ScoreTable";
import { toast } from "sonner";
import { Dice3D } from "./Dice3D";
import { TScores } from "@/lib/roomBus";

export function GameBoard() {
  const {
    gameStarted,
    countdown,
    nick,
    scores,
    turnNick,
    roomId,
    dice,
    rollsLeft,
  } = useRoom();

  const notMyTurn = turnNick !== nick;

  const handleUpdateScores = async (newScores: TScores, category: string) => {
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
      {gameStarted && turnNick && (
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <div>
              <span className="text-2xl font-bold text-blue-300">
                {turnNick}
              </span>
              님의 차례입니다.
            </div>
            <div>
              <span className="text-2xl font-bold text-pink-300">
                {getTurnNumber(scores[turnNick!] ?? {})}
              </span>{" "}
              / 12 턴
            </div>
          </CardTitle>
        </CardHeader>
      )}
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
            <Dice3D disabled={notMyTurn} />

            {/* 점수판 */}
            <ScoreTable
              scores={scores[turnNick!] ?? {}}
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
