"use client";

import { useEffect, useRef } from "react";
import DiceBox from "@drdreo/dice-box-threejs";
import { toast } from "sonner";
import { useRoom } from "@/providers/room-provider";
import { Button } from "./ui/button";
import { Dices } from "lucide-react";
import { DiceButton } from "./button/DiceButton";
import { cn } from "@/lib/utils";
import { DiceHoverOverlay } from "./DiceOverlay";

// 전역 싱글턴 DiceBox
let diceBox: DiceBox;

export function Dice3D({ disabled }: { disabled: boolean }) {
  const { nick, roomId, dice, rollsLeft } = useRoom();
  const boxRef = useRef<DiceBox | null>(null);
  const prevRollsLeft = useRef<number>(rollsLeft);

  useEffect(() => {
    if (!diceBox) {
      diceBox = new DiceBox("#dice-box", {
        baseScale: 70,
        light_intensity: 13,
        strength: 8,
        enableDiceSelection: true,
      });

      diceBox.initialize().then(() => {
        diceBox.isInitialized = true;
        boxRef.current = diceBox;
      });
    } else {
      boxRef.current = diceBox;
    }

    return () => {};
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box?.isInitialized) return;
    if (!dice || dice.length === 0) return;

    // 새 턴 → 주사위 초기화
    if (rollsLeft === 3) box.clearDice();

    // rollsLeft가 변한 경우에만 roll 실행
    if (prevRollsLeft.current !== rollsLeft && rollsLeft < 3) {
      const activeValues = dice
        .filter((d) => !d.held && d.value != null)
        .map((d) => d.value!);

      if (activeValues.length) {
        box.roll(`${activeValues.length}dpip@${activeValues.toString()}`);
        box.onDiceClick = (diceInfo) => {
          const unheldOriginalIndices = dice.reduce<number[]>(
            (acc, die, idx) => {
              if (!die.held) acc.push(idx);
              return acc;
            },
            []
          );
          const originalIndex = unheldOriginalIndices[diceInfo.id];

          toggleHold(originalIndex);
        };
      }
    }

    prevRollsLeft.current = rollsLeft;
  }, [dice, rollsLeft]);

  const rollDice = async () => {
    if (rollsLeft <= 0) {
      toast.error("더 이상 굴릴 수 없습니다!");
      return;
    }
    try {
      await fetch("/api/game/roll-dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, nick }),
      });
    } catch (err) {
      console.error("주사위 굴리기 실패:", err);
      toast.error("주사위 굴리기 실패");
    }
  };

  const toggleHold = async (index: number) => {
    try {
      await fetch("/api/game/hold-dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, nick, index }),
      });
    } catch (err) {
      console.error("주사위 고정/해제 실패:", err);
      toast.error("주사위 고정/해제 실패");
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {/* 🎲 주사위 상태 (고정 여부 표시) */}
        <div className="flex gap-4 absolute z-50 top-[12%] left-1/2 -translate-x-1/2 -translate-y-1/2">
          {dice.map((d, i) => (
            <DiceButton
              key={i}
              value={d && d.held ? d.value : null}
              disabled={disabled}
              onClick={() => toggleHold(i)}
            />
          ))}
        </div>
        <div className="dice-container">
          <div id="dice-box" />
          {!disabled && <DiceHoverOverlay />}
        </div>
      </div>

      <Button
        variant={"secondary"}
        className={cn(
          "text-white font-bold",
          rollsLeft &&
            !disabled &&
            "bg-linear-to-r/increasing from-red-500 to-rose-500 bg-[length:200%_200%] animate-gradient"
        )}
        onClick={rollDice}
        disabled={disabled || !rollsLeft}
      >
        <Dices />
        주사위 굴리기 ({rollsLeft})
      </Button>
    </div>
  );
}
