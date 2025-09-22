import { NextResponse } from "next/server";
import { getRoomState, broadcast } from "@/lib/roomBus";

export async function POST(req: Request) {
  const { roomId, nick } = await req.json();
  const room = getRoomState(roomId);

  // 현재 턴 플레이어 확인
  if (room.turnNick !== nick) {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  if (room.rollsLeft <= 0) {
    return NextResponse.json({ error: "No rolls left" }, { status: 400 });
  }

  // 🎲 굴릴 때 held=false 인 것만 랜덤 갱신
  room.dice = room.dice.map((d) =>
    d.held ? d : { ...d, value: Math.ceil(Math.random() * 6) }
  );
  room.rollsLeft--;

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

  return NextResponse.json({ dice: room.dice, rollsLeft: room.rollsLeft });
}
