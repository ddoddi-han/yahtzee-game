"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableRow } from "./ui/table";
import { TDice } from "./GameBoard";

interface ScoreTableProps {
  scores: Record<string, number | null>;
  dice: TDice["value"][];
  onUpdate: (newScores: Record<string, number | null>) => void;
  disabled: boolean;
}

const upperCategories = [
  { key: "Ones", label: "Ones" },
  { key: "Twos", label: "Twos" },
  { key: "Threes", label: "Threes" },
  { key: "Fours", label: "Fours" },
  { key: "Fives", label: "Fives" },
  { key: "Sixes", label: "Sixes" },
];

const lowerCategories = [
  { key: "FourKind", label: "Four of a Kind" },
  { key: "FullHouse", label: "Full House" },
  { key: "SmallStraight", label: "Small Straight" },
  { key: "LargeStraight", label: "Large Straight" },
  { key: "Chance", label: "Chance" },
  { key: "Yahtzee", label: "Yahtzee" },
];

// 점수 계산 로직
function calculateScore(key: string, dice: (number | null)[]): number {
  // 아직 안굴린 주사위(null)가 하나라도 있으면 점수 불가
  if (dice.some((d) => d === null)) return 0;

  const counts: Record<number, number> = {};
  for (const d of dice as number[]) counts[d] = (counts[d] || 0) + 1;
  const values = Object.values(counts);

  switch (key) {
    case "Ones":
      return dice.filter((d) => d === 1).reduce((a, b) => a + b, 0);
    case "Twos":
      return dice.filter((d) => d === 2).reduce((a, b) => a + b, 0);
    case "Threes":
      return dice.filter((d) => d === 3).reduce((a, b) => a + b, 0);
    case "Fours":
      return dice.filter((d) => d === 4).reduce((a, b) => a + b, 0);
    case "Fives":
      return dice.filter((d) => d === 5).reduce((a, b) => a + b, 0);
    case "Sixes":
      return dice.filter((d) => d === 6).reduce((a, b) => a + b, 0);

    case "FourKind":
      return values.some((v) => v >= 4)
        ? (dice as number[]).reduce((a, b) => a + b, 0)
        : 0;
    case "FullHouse":
      return values.includes(3) && values.includes(2) ? 25 : 0;
    case "SmallStraight": {
      const uniq = [...new Set(dice as number[])].sort();
      const straights = [
        [1, 2, 3, 4],
        [2, 3, 4, 5],
        [3, 4, 5, 6],
      ];
      return straights.some((s) => s.every((n) => uniq.includes(n))) ? 30 : 0;
    }
    case "LargeStraight": {
      const uniq = [...new Set(dice as number[])].sort().join("");
      return uniq === "12345" || uniq === "23456" ? 40 : 0;
    }
    case "Chance":
      return (dice as number[]).reduce((a, b) => a + b, 0);
    case "Yahtzee":
      return values.includes(5) ? 50 : 0;
    default:
      return 0;
  }
}

export function ScoreTable({
  scores,
  dice,
  onUpdate,
  disabled,
}: ScoreTableProps) {
  // 예측 점수 맵
  const predicted = React.useMemo(() => {
    const all: Record<string, number> = {};
    [...upperCategories, ...lowerCategories].forEach(({ key }) => {
      all[key] = calculateScore(key, dice);
    });
    // Bonus는 자동 계산이므로 여기선 제외
    return all;
  }, [dice]);

  // 가장 높은 예상값 찾기
  const highlightKeys = React.useMemo(() => {
    let maxVal = -1;
    const candidates: string[] = [];
    for (const [key, val] of Object.entries(predicted)) {
      if (scores[key] !== null) continue; // 이미 채점된 건 제외
      if (val > maxVal) {
        maxVal = val;
        candidates.length = 0;
        candidates.push(key);
      } else if (val === maxVal) {
        candidates.push(key);
      }
    }
    return candidates;
  }, [predicted, scores]);

  // 상단 합계 & 보너스
  const upperTotal =
    (scores.Ones ?? 0) +
    (scores.Twos ?? 0) +
    (scores.Threes ?? 0) +
    (scores.Fours ?? 0) +
    (scores.Fives ?? 0) +
    (scores.Sixes ?? 0);

  const bonus = upperTotal >= 63 ? 35 : 0;

  React.useEffect(() => {
    if (scores.Bonus !== bonus) {
      onUpdate({ ...scores, Bonus: bonus });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upperTotal, bonus]);

  const lowerTotal =
    (scores.FourKind ?? 0) +
    (scores.FullHouse ?? 0) +
    (scores.SmallStraight ?? 0) +
    (scores.LargeStraight ?? 0) +
    (scores.Chance ?? 0) +
    (scores.Yahtzee ?? 0);

  const totalSum = upperTotal + bonus + lowerTotal;

  const handleSelect = (key: string) => {
    if (key === "Bonus") return;
    if (scores[key] !== null) return;
    const newScore = predicted[key] ?? 0;
    onUpdate({ ...scores, [key]: newScore });
  };

  const isRowDisabled = (key: string) => {
    if (disabled) return true; // 내 턴 아님
    if (key === "Bonus") return true; // 자동 계산
    if (scores[key] !== null) return true; // 이미 채점됨
    return false;
  };

  const renderRow = (
    key: string,
    label: string,
    value: number | null,
    options?: { auto?: boolean }
  ) => {
    const auto = options?.auto ?? false;
    const isDisabled = isRowDisabled(key) || auto;
    const showPred = value === null && key !== "Bonus";
    const predVal = predicted[key];

    return (
      <TableRow key={key}>
        <TableCell className="align-middle">{label}</TableCell>
        <TableCell className="text-right flex items-center justify-end gap-3">
          {/* 예상 점수 미리보기 */}
          {showPred && predVal && !isDisabled ? (
            <span
              className={`text-xs h-5 leading-6 ${
                highlightKeys.includes(key)
                  ? "text-red-300 font-bold"
                  : "text-muted-foreground"
              }`}
            >
              {predVal}점
            </span>
          ) : (
            <></>
          )}

          {/* 값 또는 체크박스 */}
          {value !== null ? (
            <span className="font-semibold">{value}</span>
          ) : key === "Bonus" ? (
            <span className="font-semibold">{bonus}</span>
          ) : (
            <Checkbox
              disabled={isDisabled}
              onCheckedChange={(c) => c && handleSelect(key)}
              aria-label={`${label} 선택`}
            />
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Table className="w-full text-sm">
      <TableBody>
        {/* Upper Section */}
        {upperCategories.map((cat) =>
          renderRow(cat.key, cat.label, scores[cat.key])
        )}
        {renderRow("Bonus", "보너스 (+35)", bonus, { auto: true })}
        <TableRow className="font-semibold bg-muted">
          <TableCell>상단 합계</TableCell>
          <TableCell className="text-right">{upperTotal + bonus}</TableCell>
        </TableRow>

        <TableRow className="h-9"></TableRow>

        {/* Lower Section */}
        {lowerCategories.map((cat) =>
          renderRow(cat.key, cat.label, scores[cat.key])
        )}
        <TableRow className="font-semibold bg-muted">
          <TableCell>하단 합계</TableCell>
          <TableCell className="text-right">{lowerTotal}</TableCell>
        </TableRow>

        {/* Total */}
        <TableRow className="font-bold bg-accent">
          <TableCell>총합</TableCell>
          <TableCell className="text-right">{totalSum}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
