"use client";

import * as React from "react";
import { Dice } from "./Dice";

interface DiceListProps {
  dice: { value: number; held: boolean }[];
  onToggle: (i: number) => void;
}

export function DiceList({ dice, onToggle }: DiceListProps) {
  return (
    <div className="flex gap-4 my-6">
      {dice.map((d, i) => (
        <Dice
          key={i}
          value={d.value}
          held={d.held}
          onToggle={() => onToggle(i)}
        />
      ))}
    </div>
  );
}
