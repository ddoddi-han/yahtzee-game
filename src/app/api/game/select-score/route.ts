import { NextResponse } from "next/server";
import { updateScores, nextTurn, getRoomState, broadcast } from "@/lib/roomBus";
import { toast } from "sonner";

type SelectScoreRequest = {
  roomId: string;
  nick: string;
  scores: Record<string, number | null>;
  lastSelected: string | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SelectScoreRequest;
    const { roomId, nick, scores, lastSelected } = body;

    if (!roomId || !nick || !scores) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // 점수 업데이트
    if (lastSelected) {
      updateScores(roomId, nick, scores, lastSelected);

      if (nick && lastSelected) {
        if (lastSelected === "보너스 (+35)") {
          const text = `🎉 ${nick}님이 ${lastSelected}를 달성했습니다!`;
          broadcast(roomId, { type: "system", text, at: Date.now() });
          toast.success(text);
        } else {
          const text = `${nick}님이 ${lastSelected}를 선택했습니다.`;
          broadcast(roomId, { type: "system", text, at: Date.now() });
          toast.success(text);
        }
      }

      nextTurn(roomId);
    }

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
