'use client';

import * as React from 'react';
import {
  CATEGORY_LABELS,
  LOWER_CATEGORIES,
  SCORE_CATEGORIES,
  ScoreCategory,
  ScoreSheet,
  UPPER_CATEGORIES,
} from '@/features/game/domain/categories';
import {
  calculateScore,
  calculateTotal,
  calculateUpperTotal,
  DiceValue,
  RolledDice,
} from '@/features/game/domain/scoring';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from './ui/table';

interface ScoreTableProps {
  scores: ScoreSheet;
  dice: (DiceValue | null)[];
  onSelectCategory: (category: ScoreCategory) => void;
  disabled: boolean;
}

export const getTurnNumber = (playerScores: Partial<ScoreSheet>) => {
  const filled = SCORE_CATEGORIES.filter(
    category => playerScores[category] !== null && playerScores[category] !== undefined
  ).length;
  return Math.min(filled + 1, SCORE_CATEGORIES.length);
};

function toRolledDice(dice: (DiceValue | null)[]): RolledDice | null {
  if (dice.length !== 5 || dice.some(value => value === null)) return null;
  return dice as RolledDice;
}

export function ScoreTable({ scores, dice, onSelectCategory, disabled }: ScoreTableProps) {
  const rolledDice = React.useMemo(() => toRolledDice(dice), [dice]);

  const predicted = React.useMemo(() => {
    if (!rolledDice) return null;
    return Object.fromEntries(
      SCORE_CATEGORIES.map(category => [category, calculateScore(category, rolledDice)])
    ) as Record<ScoreCategory, number>;
  }, [rolledDice]);

  const upperTotal = calculateUpperTotal(scores);
  const lowerTotal = LOWER_CATEGORIES.reduce(
    (total, category) => total + (scores[category] ?? 0),
    0
  );
  const totalSum = calculateTotal(scores);

  const isRowDisabled = (category: ScoreCategory) => {
    if (disabled) return true;
    if (!rolledDice) return true;
    if (scores[category] !== null) return true;
    return false;
  };

  const renderCategoryRow = (category: ScoreCategory) => {
    const savedScore = scores[category];
    const previewScore = predicted?.[category] ?? 0;
    const isDisabled = isRowDisabled(category);

    return (
      <TableRow key={category}>
        <TableCell className="align-middle">{CATEGORY_LABELS[category]}</TableCell>
        <TableCell className="text-right">
          {savedScore !== null ? (
            <span className="font-semibold">{savedScore}</span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isDisabled}
              onClick={() => onSelectCategory(category)}
            >
              {rolledDice ? `${previewScore}점 선택` : '-'}
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="flex-1 overflow-auto rounded-lg border p-2">
      <Table className="w-full text-sm">
        <TableBody>
          {UPPER_CATEGORIES.map(renderCategoryRow)}
          <TableRow>
            <TableCell className="align-middle">{CATEGORY_LABELS.Bonus}</TableCell>
            <TableCell className="text-right font-semibold">{scores.Bonus}</TableCell>
          </TableRow>
          <TableRow className="bg-muted font-semibold">
            <TableCell>상단 합계</TableCell>
            <TableCell className="text-right">{upperTotal + scores.Bonus}</TableCell>
          </TableRow>

          <TableRow className="h-9" />

          {LOWER_CATEGORIES.map(renderCategoryRow)}
          <TableRow className="bg-muted font-semibold">
            <TableCell>하단 합계</TableCell>
            <TableCell className="text-right">{lowerTotal}</TableCell>
          </TableRow>

          <TableRow className="bg-accent font-bold">
            <TableCell>총합</TableCell>
            <TableCell className="text-right">{totalSum}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
