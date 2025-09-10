import { broadcast } from "@/lib/roomBus";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { room, nick, text } = await req.json();
  if (!room || !nick || !text) {
    return new Response("Bad Request", { status: 400 });
  }

  broadcast(room, {
    type: "chat",
    nick,
    text: String(text).slice(0, 2000), // 간단 방어
    at: Date.now(),
  });

  return new Response("ok");
}
