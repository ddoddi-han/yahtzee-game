"use client";

import { Button } from "../ui/button";

function DiceEye({ value }: { value: number | null }) {
  if (value == null) return null;

  const positions: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  return (
    <div className="grid grid-cols-3 grid-rows-3 w-full h-full">
      {Array.from({ length: 9 }, (_, i) => i + 1).map((pos) => (
        <div key={pos} className="flex items-center justify-center">
          {positions[value].includes(pos) && (
            <div className="w-2 h-2 bg-radial-[at_75%_75%] from-white to-black to-25% rounded-full" />
          )}
        </div>
      ))}
    </div>
  );
}

export function DiceButton({
  value,
  held,
  disabled,
  onClick,
}: {
  value: number | null;
  held: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (value === null) return null;

  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={`w-11 h-11 p-1 rounded-xs disabled:opacity-100 inset-shadow-sm inset-shadow-black/10  ${
        held ? "!bg-muted-foreground" : "!bg-white"
      }`}
    >
      <DiceEye value={value} />
    </Button>
  );
}
