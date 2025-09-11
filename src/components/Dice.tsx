"use client";

import * as React from "react";

interface DiceProps {
  value: number;
  held: boolean;
  onToggle: () => void;
}

export function Dice({ value, held, onToggle }: DiceProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-12 h-12 flex items-center justify-center border rounded-lg text-xl transition ${
        held ? "bg-emerald-200" : "bg-white hover:bg-gray-100"
      }`}
    >
      🎲 {value}
    </button>
  );
}
