import { useRoom } from "@/contexts/RoomContext";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Dices } from "lucide-react";

export function Dice({ disabled }: { disabled: boolean }) {
  const { nick, roomId, dice, rollsLeft } = useRoom();

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

  return (
    <div className="flex md:flex-row flex-col justify-between items-center gap-4">
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

      <Button onClick={rollDice} disabled={disabled}>
        <Dices />
        주사위 굴리기 ({rollsLeft})
      </Button>
    </div>
  );
}
