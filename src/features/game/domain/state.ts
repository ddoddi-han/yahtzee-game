import { ScoreSheet } from './categories';
import { DiceValue } from './scoring';

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'finished';

export type Die = {
  value: DiceValue | null;
  held: boolean;
};

export type Player = {
  nick: string;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  scoreSheet: ScoreSheet;
};

export type GameResult = {
  totals: Record<string, number>;
  winners: string[];
  finishedAt: number;
};

export type RoomEvent = {
  id: string;
  roomId: string;
  type: 'system' | 'chat' | 'game';
  nick?: string;
  text?: string;
  at: number;
};

export type RoomState = {
  roomId: string;
  phase: RoomPhase;
  players: Map<string, Player>;
  turnOrder: string[];
  turnIndex: number;
  dice: Die[];
  rollsLeft: number;
  countdown: number | null;
  result: GameResult | null;
  events: RoomEvent[];
};

export function createInitialDice(): Die[] {
  return Array.from({ length: 5 }, () => ({ value: null, held: false }));
}
