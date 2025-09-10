import { setReady } from "@/lib/roomBus";

export async function POST(req: Request) {
  const { room, nick, ready } = await req.json();
  if (!room || !nick) return new Response("Bad Request", { status: 400 });

  setReady(room, nick, ready);
  return new Response("ok");
}
