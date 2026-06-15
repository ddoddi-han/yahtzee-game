import {
  ScoreCategory,
  ScoreSheet,
  UPPER_CATEGORIES,
  UpperCategory,
  SCORE_CATEGORIES,
} from './categories';

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type RolledDice = [DiceValue, DiceValue, DiceValue, DiceValue, DiceValue];

const UPPER_FACE_BY_CATEGORY: Record<UpperCategory, DiceValue> = {
  Ones: 1,
  Twos: 2,
  Threes: 3,
  Fours: 4,
  Fives: 5,
  Sixes: 6,
};

function sum(dice: readonly DiceValue[]) {
  return dice.reduce((total, value) => total + value, 0);
}

function counts(dice: readonly DiceValue[]) {
  return dice.reduce<Record<DiceValue, number>>(
    (acc, value) => {
      acc[value] += 1;
      return acc;
    },
    { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  );
}

function hasStraight(dice: readonly DiceValue[], length: 4 | 5) {
  const values = new Set<DiceValue>(dice);
  const runs: DiceValue[][] =
    length === 4
      ? [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
        ]
      : [
          [1, 2, 3, 4, 5],
          [2, 3, 4, 5, 6],
        ];

  return runs.some(run => run.every(value => values.has(value)));
}

function isUpperCategory(category: ScoreCategory): category is UpperCategory {
  return category in UPPER_FACE_BY_CATEGORY;
}

export function calculateScore(category: ScoreCategory, dice: RolledDice) {
  if (isUpperCategory(category)) {
    const face = UPPER_FACE_BY_CATEGORY[category];
    return dice.filter(value => value === face).reduce((total, value) => total + value, 0);
  }

  const frequencies = Object.values(counts(dice));

  switch (category) {
    case 'ThreeKind':
      return frequencies.some(count => count >= 3) ? sum(dice) : 0;
    case 'FourKind':
      return frequencies.some(count => count >= 4) ? sum(dice) : 0;
    case 'FullHouse':
      return frequencies.includes(3) && frequencies.includes(2) ? 25 : 0;
    case 'SmallStraight':
      return hasStraight(dice, 4) ? 30 : 0;
    case 'LargeStraight':
      return hasStraight(dice, 5) ? 40 : 0;
    case 'Chance':
      return sum(dice);
    case 'Yahtzee':
      return frequencies.includes(5) ? 50 : 0;
  }
}

export function calculateUpperTotal(scoreSheet: ScoreSheet) {
  return UPPER_CATEGORIES.reduce((total, category) => total + (scoreSheet[category] ?? 0), 0);
}

export function calculateBonus(scoreSheet: ScoreSheet) {
  return calculateUpperTotal(scoreSheet) >= 63 ? 35 : 0;
}

export function calculateTotal(scoreSheet: ScoreSheet) {
  return SCORE_CATEGORIES.reduce(
    (total, category) => total + (scoreSheet[category] ?? 0),
    scoreSheet.Bonus
  );
}

export function isScoreSheetComplete(scoreSheet: ScoreSheet) {
  return SCORE_CATEGORIES.every(category => scoreSheet[category] !== null);
}
