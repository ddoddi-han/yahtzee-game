'use client';

import { GameResult as GameResultType } from '@/features/game/domain/state';
import { Trophy } from 'lucide-react';
import { Button } from './ui/button';

export function GameResult({
  result,
  onRestart,
}: {
  result: GameResultType;
  onRestart: () => void;
}) {
  const rows = Object.entries(result.totals).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-xl font-semibold">
        <Trophy className="size-5" />
        게임 결과
      </div>
      <div className="rounded-md border">
        {rows.map(([playerNick, total]) => (
          <div
            key={playerNick}
            className="flex items-center justify-between border-b px-3 py-2 last:border-b-0"
          >
            <span className="font-medium">
              {result.winners.includes(playerNick) ? 'Winner ' : ''}
              {playerNick}
            </span>
            <span>{total}</span>
          </div>
        ))}
      </div>
      <Button onClick={onRestart}>다시 시작</Button>
    </section>
  );
}
