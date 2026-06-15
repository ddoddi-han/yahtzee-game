import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { holdDiceInputSchema } from '@/features/game/server/api-schemas';
import { toggleHeldDie } from '@/features/game/server/room-runtime';

export async function POST(req: Request) {
  try {
    const input = holdDiceInputSchema.parse(await req.json());
    return NextResponse.json(toggleHeldDie(input));
  } catch (error) {
    return jsonError(error);
  }
}
