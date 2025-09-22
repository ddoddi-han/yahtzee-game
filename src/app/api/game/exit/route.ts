import { NextResponse } from "next/server";
import { removeClient } from "@/lib/roomBus";

export async function POST(req: Request) {
  const { roomId, nick } = await req.json();
  removeClient(roomId, nick, true); // immediate = true
  return NextResponse.json({ success: true });
}
