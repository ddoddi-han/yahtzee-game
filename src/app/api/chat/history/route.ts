import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError } from '@/features/game/server/api-response';
import { roomIdSchema } from '@/features/game/server/api-schemas';
import { getRoomSnapshot } from '@/features/game/server/room-runtime';
import { pageByInput, paginationInputSchema } from '@/features/game/shared/pagination';

const chatHistoryInputSchema = z.object({
  roomId: roomIdSchema,
  pagination: paginationInputSchema.default({ limit: 30 }),
});

export async function POST(req: Request) {
  try {
    const input = chatHistoryInputSchema.parse(await req.json());
    const room = getRoomSnapshot(input.roomId);
    const chatEvents = room.events.filter(
      event => event.type === 'chat' || event.type === 'system'
    );

    return NextResponse.json(pageByInput(chatEvents, input.pagination));
  } catch (error) {
    return jsonError(error);
  }
}
