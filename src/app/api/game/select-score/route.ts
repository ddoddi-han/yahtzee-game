import { NextResponse } from "next/server";
import { updateScores, nextTurn, getRoomState } from "@/lib/roomBus";

type SelectScoreRequest = {
  roomId: string;
  nick: string;
  scores: Record<string, number | null>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SelectScoreRequest;
    const { roomId, nick, scores } = body;

    if (!roomId || !nick || !scores) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 점수 업데이트
    updateScores(roomId, nick, scores);

    // 턴 전환
    nextTurn(roomId);

    const state = getRoomState(roomId);

    return NextResponse.json({
      success: true,
      turnIndex: state.turnIndex,
      scores: state.scores,
    });
  } catch (err) {
    console.error("select-score error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
