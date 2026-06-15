import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { readyInputSchema } from '@/features/game/server/api-schemas';
import { setReady } from '@/features/game/server/room-runtime';

export async function POST(req: Request) {
  try {
    const input = readyInputSchema.parse(await req.json());
    return NextResponse.json(setReady(input.roomId, input.nick, input.ready));
  } catch (error) {
    return jsonError(error);
  }
}
