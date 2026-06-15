import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { sendChatInputSchema } from '@/features/game/server/api-schemas';
import { sendChat } from '@/features/game/server/room-runtime';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const input = sendChatInputSchema.parse(await req.json());
    return NextResponse.json(sendChat(input));
  } catch (error) {
    return jsonError(error);
  }
}
