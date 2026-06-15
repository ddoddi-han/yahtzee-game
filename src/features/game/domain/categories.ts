export const UPPER_CATEGORIES = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'] as const;

export const LOWER_CATEGORIES = [
  'ThreeKind',
  'FourKind',
  'FullHouse',
  'SmallStraight',
  'LargeStraight',
  'Chance',
  'Yahtzee',
] as const;

export const SCORE_CATEGORIES = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES] as const;

export type UpperCategory = (typeof UPPER_CATEGORIES)[number];
export type LowerCategory = (typeof LOWER_CATEGORIES)[number];
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export type ScoreSheet = Record<ScoreCategory, number | null> & {
  Bonus: number;
};

export const CATEGORY_LABELS: Record<ScoreCategory | 'Bonus', string> = {
  Ones: 'Ones',
  Twos: 'Twos',
  Threes: 'Threes',
  Fours: 'Fours',
  Fives: 'Fives',
  Sixes: 'Sixes',
  Bonus: 'Bonus (+35)',
  ThreeKind: 'Three of a Kind',
  FourKind: 'Four of a Kind',
  FullHouse: 'Full House',
  SmallStraight: 'Small Straight',
  LargeStraight: 'Large Straight',
  Chance: 'Chance',
  Yahtzee: 'Yahtzee',
};

export function createEmptyScoreSheet(): ScoreSheet {
  return {
    Ones: null,
    Twos: null,
    Threes: null,
    Fours: null,
    Fives: null,
    Sixes: null,
    Bonus: 0,
    ThreeKind: null,
    FourKind: null,
    FullHouse: null,
    SmallStraight: null,
    LargeStraight: null,
    Chance: null,
    Yahtzee: null,
  };
}
