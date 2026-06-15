'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useDiceBoxAdapter } from '@/features/game/client/use-dice-box-adapter';
import { useGameView, useRoomActions } from '@/providers/room-provider';
import { Button } from './ui/button';
import { Dices } from 'lucide-react';
import { DiceButton } from './button/DiceButton';
import { cn } from '@/lib/utils';
import { DiceHoverOverlay } from './DiceOverlay';

export function Dice3D({ disabled }: { disabled: boolean }) {
  const { dice, rollsLeft } = useGameView();
  const actions = useRoomActions();
  const prevRollsLeft = useRef<number>(rollsLeft);

  const toggleFromEngine = useCallback(
    async (index: number) => {
      try {
        const snapshot = await actions.toggleHold(index);
        return snapshot.dice[index].held;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '주사위 고정/해제 실패');
        return false;
      }
    },
    [actions]
  );

  const diceBox = useDiceBoxAdapter(toggleFromEngine);

  const toggleHold = useCallback(
    async (index: number) => {
      try {
        const snapshot = await actions.toggleHold(index);
        const updatedDice = snapshot.dice[index];
        if (!updatedDice.held) await diceBox.restoreDie(index, updatedDice.value);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '주사위 고정/해제 실패');
      }
    },
    [actions, diceBox]
  );

  useEffect(() => {
    if (!dice || dice.length === 0) return;

    if (rollsLeft === 3) diceBox.clear();

    if (prevRollsLeft.current !== rollsLeft && rollsLeft < 3) {
      const unheldOriginIdxs = dice.reduce<number[]>((acc, die, idx) => {
        if (!die.held && die.value != null) acc.push(idx);
        return acc;
      }, []);

      const activeValues = unheldOriginIdxs.map(i => dice[i].value!);
      diceBox.rollValues(activeValues, unheldOriginIdxs);
    }

    prevRollsLeft.current = rollsLeft;
  }, [dice, rollsLeft, diceBox]);

  const rollDice = async () => {
    if (rollsLeft <= 0) {
      toast.error('더 이상 굴릴 수 없습니다!');
      return;
    }
    try {
      await actions.rollDice();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '주사위 굴리기 실패');
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
        variant={'secondary'}
        className={cn(
          'text-white font-bold',
          rollsLeft &&
            !disabled &&
            'bg-linear-to-r/increasing from-red-500 to-rose-500 bg-[length:200%_200%] animate-gradient'
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
