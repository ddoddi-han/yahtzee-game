import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { joinRoomInputSchema } from '@/features/game/server/api-schemas';
import { markDisconnected } from '@/features/game/server/room-runtime';

export async function POST(req: Request) {
  try {
    const input = joinRoomInputSchema.parse(await req.json());
    return NextResponse.json(markDisconnected(input.roomId, input.nick));
  } catch (error) {
    return jsonError(error);
  }
}
