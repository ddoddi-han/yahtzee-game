"use client";

import React, { useEffect, useRef } from "react";
import DiceBox from "@3d-dice/dice-box";
import { toast } from "sonner";
import { useRoom } from "@/providers/room-provider";
import { Button } from "./ui/button";
import { Dices } from "lucide-react";

// 전역 싱글턴 DiceBox
let diceBox: any = null;

export function Dice3D({ disabled }: { disabled: boolean }) {
  const { nick, roomId, dice, rollsLeft } = useRoom();
  const boxRef = useRef<any>(null);

  useEffect(() => {
    if (!diceBox) {
      diceBox = new DiceBox("#dice-box", {
        assetPath: "/assets/dice-box/",
        theme: "smooth-pip",
        themeColor: "#FFFFFF",
        scale: 14,
      });

      diceBox.init().then(() => {
        diceBox.isInitialized = true;
        boxRef.current = diceBox;
      });
    } else {
      boxRef.current = diceBox;
    }

    return () => {};
  }, []);

  useEffect(() => {
    if (!boxRef.current) return;
    if (!dice || dice.length === 0) return;

    if (!boxRef.current.isInitialized) return;

    const results = dice
      .filter((d) => !d.held && d.value != null)
      .map((d) => d.value!);

    if (results.length > 0) {
      boxRef.current.roll(`${results.length}dpip`, results);
    }
  }, [dice]);

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
    <div className="flex md:flex-row flex-col justify-between items-center gap-4">
      <div className="flex flex-col">
        {/* 🎲 주사위 상태 (고정 여부 표시) */}
        <div className="flex gap-3">
          {dice.map((d, i) => (
            <Button
              variant={"outline"}
              key={i}
              disabled={disabled}
              onClick={() => toggleHold(i)}
              className={`w-12 h-12 text-xl ${
                d.held ? "!bg-muted-foreground" : ""
              }`}
            >
              {d.value}
            </Button>
          ))}
        </div>
        <div id="dice-box" />
      </div>

      <Button onClick={rollDice} disabled={disabled}>
        <Dices />
        주사위 굴리기 ({rollsLeft})
      </Button>
    </div>
  );
}
