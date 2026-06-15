import { z } from 'zod';
import { SCORE_CATEGORIES } from '../domain/categories';

export const roomIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const nickSchema = z.string().trim().min(1).max(10);

export const joinRoomInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
});

export const readyInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  ready: z.boolean(),
});

export const rollDiceInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
});

export const holdDiceInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  index: z.number().int().min(0).max(4),
});

export const selectScoreInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  category: z.enum(SCORE_CATEGORIES),
});

export const sendChatInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  text: z.string().trim().min(1).max(2000),
});
