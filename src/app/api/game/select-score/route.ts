import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { selectScoreInputSchema } from '@/features/game/server/api-schemas';
import { selectScore } from '@/features/game/server/room-runtime';

export async function POST(req: Request) {
  try {
    const input = selectScoreInputSchema.parse(await req.json());
    return NextResponse.json(selectScore(input));
  } catch (error) {
    return jsonError(error);
  }
}
