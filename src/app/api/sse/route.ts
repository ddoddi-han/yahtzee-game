import { joinRoomInputSchema } from '@/features/game/server/api-schemas';
import { jsonError } from '@/features/game/server/api-response';
import { addConnection, removeConnection } from '@/features/game/server/sse-bus';
import {
  joinRoom,
  removeRoomIfEmpty,
  scheduleDisconnect,
} from '@/features/game/server/room-runtime';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const input = joinRoomInputSchema.parse({
      roomId: searchParams.get('room'),
      nick: searchParams.get('nick'),
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const connection = {
          id: crypto.randomUUID(),
          nick: input.nick,
          controller,
        };
        let closed = false;

        addConnection(input.roomId, connection);
        joinRoom(input.roomId, input.nick);

        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          } catch {}
        }, 15000);

        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          const removedCurrentConnection = removeConnection(
            input.roomId,
            input.nick,
            connection.id
          );
          if (removedCurrentConnection) {
            scheduleDisconnect(input.roomId, input.nick);
          }
          removeRoomIfEmpty(input.roomId);
        };

        req.signal.addEventListener('abort', close, { once: true });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
