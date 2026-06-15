import { Die, createInitialDice } from './state';
import { DiceValue, RolledDice } from './scoring';

export function rollDie(): DiceValue {
  return (Math.floor(Math.random() * 6) + 1) as DiceValue;
}

export function rollDice(dice: readonly Die[]): Die[] {
  return dice.map(die => (die.held ? die : { ...die, value: rollDie() }));
}

export function assertRolledDice(dice: readonly Die[]): RolledDice {
  if (dice.length !== 5 || dice.some(die => die.value === null)) {
    throw new Error('Dice must be rolled before scoring.');
  }

  return dice.map(die => die.value) as RolledDice;
}

export function resetDice() {
  return createInitialDice();
}
