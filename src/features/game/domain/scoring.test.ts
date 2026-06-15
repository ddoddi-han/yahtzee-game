import { describe, expect, it } from 'vitest';
import { createEmptyScoreSheet } from './categories';
import { calculateBonus, calculateScore, calculateTotal, isScoreSheetComplete } from './scoring';

describe('Yahtzee scoring', () => {
  it('scores upper categories', () => {
    expect(calculateScore('Threes', [3, 3, 1, 5, 3])).toBe(9);
  });

  it('scores lower categories', () => {
    expect(calculateScore('ThreeKind', [2, 2, 2, 5, 6])).toBe(17);
    expect(calculateScore('FourKind', [4, 4, 4, 4, 1])).toBe(17);
    expect(calculateScore('FullHouse', [2, 2, 3, 3, 3])).toBe(25);
    expect(calculateScore('SmallStraight', [1, 2, 3, 4, 6])).toBe(30);
    expect(calculateScore('LargeStraight', [2, 3, 4, 5, 6])).toBe(40);
    expect(calculateScore('Chance', [1, 2, 3, 4, 6])).toBe(16);
    expect(calculateScore('Yahtzee', [5, 5, 5, 5, 5])).toBe(50);
  });

  it('keeps bonus derived from upper total', () => {
    const sheet = createEmptyScoreSheet();
    sheet.Ones = 3;
    sheet.Twos = 6;
    sheet.Threes = 9;
    sheet.Fours = 12;
    sheet.Fives = 15;
    sheet.Sixes = 18;
    expect(calculateBonus(sheet)).toBe(35);
  });

  it('calculates total and completion', () => {
    const sheet = createEmptyScoreSheet();
    for (const key of Object.keys(sheet)) {
      if (key !== 'Bonus') sheet[key as keyof typeof sheet] = 0;
    }
    sheet.Bonus = 35;
    expect(calculateTotal(sheet)).toBe(35);
    expect(isScoreSheetComplete(sheet)).toBe(true);
  });
});
