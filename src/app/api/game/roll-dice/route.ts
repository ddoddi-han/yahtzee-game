import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { rollDiceInputSchema } from '@/features/game/server/api-schemas';
import { rollCurrentTurnDice } from '@/features/game/server/room-runtime';

export async function POST(req: Request) {
  try {
    const input = rollDiceInputSchema.parse(await req.json());
    return NextResponse.json(rollCurrentTurnDice(input));
  } catch (error) {
    return jsonError(error);
  }
}
