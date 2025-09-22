import { NextResponse } from "next/server";
import { getRoomState, broadcast } from "@/lib/roomBus";

export async function POST(req: Request) {
  const { roomId, nick, index } = await req.json();
  const room = getRoomState(roomId);

  // ✅ 현재 턴 플레이어 확인 (turnNick 사용)
  if (room.turnNick !== nick) {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  if (index < 0 || index >= room.dice.length) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  room.dice[index].held = !room.dice[index].held;

  // ✅ 상태 브로드캐스트
  broadcast(roomId, {
    type: "game",
    event: "state",
    started: room.started,
    countdown: room.countdown,
    turnNick: room.turnNick,
    scores: room.scores,
    dice: room.dice,
    rollsLeft: room.rollsLeft,
  });

  return NextResponse.json({ dice: room.dice });
}
