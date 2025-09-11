import { getRoomState } from "@/lib/roomBus";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { roomId, nick } = await req.json();

  if (!roomId || !nick) {
    return new Response(
      JSON.stringify({ ok: false, reason: "Missing roomId or nick" }),
      { status: 400 }
    );
  }

  const state = getRoomState(roomId);

  // 게임이 이미 시작된 경우
  if (state.started) {
    return new Response(
      JSON.stringify({ ok: false, reason: "이미 게임이 시작된 방입니다." }),
      { status: 403 }
    );
  }

  // 닉네임 중복 체크
  const duplicate = [...state.clients].some((c) => c.nick === nick);
  if (duplicate) {
    return new Response(
      JSON.stringify({ ok: false, reason: "이미 사용 중인 닉네임입니다." }),
      { status: 403 }
    );
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
