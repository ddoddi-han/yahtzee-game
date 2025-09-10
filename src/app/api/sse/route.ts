import { addClient, broadcast, removeClient } from "@/lib/roomBus";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get("room");
  const nick = searchParams.get("nick");

  if (!room || !nick) {
    return new Response("Missing room or nick", { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const id = crypto.randomUUID();

      addClient(room, { id, nick, controller });

      // 입장 시스템 메시지 브로드캐스트
      broadcast(room, {
        type: "system",
        text: `${nick}님이 입장했습니다.`,
        at: Date.now(),
      });

      // SSE keep-alive/heartbeat
      const enc = new TextEncoder();
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {}
      }, 15000);

      // 연결 종료 처리
      const close = () => {
        clearInterval(heartbeat);
        removeClient(room, id);
        broadcast(room, {
          type: "system",
          text: `${nick}님이 퇴장했습니다.`,
          at: Date.now(),
        });
        try {
          controller.close();
        } catch {}
      };

      // 탭 닫힘/네트워크 종료 등
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      // 클라이언트 측에서 EventSource.close() 호출 시
      // 위 abort 핸들러가 대부분 처리함
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
