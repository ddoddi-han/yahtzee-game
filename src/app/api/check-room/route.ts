import { GameError } from '@/features/game/domain/errors';
import { joinRoomInputSchema } from '@/features/game/server/api-schemas';
import { canJoinRoom } from '@/features/game/server/room-runtime';
import { ZodError } from 'zod';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const input = joinRoomInputSchema.parse(await req.json());
    canJoinRoom(input.roomId, input.nick);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof GameError) {
      return Response.json({ ok: false, reason: error.message }, { status: error.status });
    }

    if (error instanceof ZodError) {
      return Response.json(
        { ok: false, reason: 'Missing roomId or nick', issues: error.issues },
        { status: 400 }
      );
    }

    return Response.json({ ok: false, reason: 'Internal Server Error' }, { status: 500 });
  }
}
