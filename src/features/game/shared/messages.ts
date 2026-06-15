import { ScoreSheet } from '../domain/categories';
import { Die, GameResult, RoomPhase } from '../domain/state';

export type UserView = {
  nick: string;
  ready: boolean;
  connected: boolean;
};

export type GameSnapshot = {
  roomId: string;
  phase: RoomPhase;
  users: UserView[];
  countdown: number | null;
  turnNick: string | null;
  scores: Record<string, ScoreSheet>;
  dice: Die[];
  rollsLeft: number;
  result: GameResult | null;
};

export type RoomMessage = {
  id: string;
  type: 'system' | 'chat';
  text?: string;
  nick?: string;
  at: number;
};

export type ServerMessage =
  | { type: 'system'; id: string; text: string; at: number }
  | { type: 'chat'; id: string; nick: string; text: string; at: number }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'force-exit'; reason: string };
