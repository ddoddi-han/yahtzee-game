// /api/toggle-hold/route.ts
import { NextResponse } from "next/server";
import { getRoomState, broadcast } from "@/lib/roomBus";

export async function POST(req: Request) {
  const { roomId, nick, index } = await req.json();
  const room = getRoomState(roomId);

  const turnPlayer = [...room.clients][room.turnIndex % room.clients.size]
    ?.nick;
  if (turnPlayer !== nick) {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  if (index < 0 || index >= room.dice.length) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  room.dice[index].held = !room.dice[index].held;

  broadcast(roomId, {
    type: "game",
    event: "state",
    started: room.started,
    countdown: room.countdown,
    turnIndex: room.turnIndex,
    scores: room.scores,
    dice: room.dice,
    rollsLeft: room.rollsLeft,
  });

  return NextResponse.json({ dice: room.dice });
}
