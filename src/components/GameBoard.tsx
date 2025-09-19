"use client";

import { useRoom } from "@/contexts/RoomContext";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { ScoreTable } from "./ScoreTable";
import { Dices } from "lucide-react";
import { toast } from "sonner";

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

  async function rollDice() {
    try {
      await fetch("/api/game/roll-dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, nick }),
      });
    } catch (err) {
      console.error("주사위 굴리기 실패:", err);
      toast.error("주사위 굴리기에 실패했습니다.");
    }
  }

  async function toggleHold(index: number) {
    try {
      await fetch("/api/game/hold-dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, nick, index }),
      });
    } catch (err) {
      console.error("주사위 고정/해제 실패:", err);
      toast.error("주사위 고정/해제에 실패했습니다.");
    }
  }

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
