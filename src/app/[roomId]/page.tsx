"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatRoom } from "@/components/ChatRoom";
// import { GameBoard } from "@/components/GameBoard"; // 나중에 붙일 예정
import { Button } from "@/components/ui/button";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [nick, setNick] = React.useState("");

  React.useEffect(() => {
    const savedNick = localStorage.getItem("chat_nick");
    if (savedNick) {
      setNick(savedNick);
    } else {
      // 닉네임 없으면 다시 입장 페이지로
      router.replace("/");
    }
  }, [router]);

  if (!nick) return null;

  return (
    <main className="grid grid-cols-[7fr_3fr] h-full gap-6 p-4 md:p-8">
      {/* 나중에 야추 게임판 UI 붙일 곳 */}
      {/* <GameBoard roomId={roomId} nick={nick} /> */}
      <div className="border rounded-lg">게임 보드 자리</div>

      {/* 채팅방 */}
      <ChatRoom roomId={roomId} nick={nick} />
    </main>
  );
}
