"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type User = { nick: string; ready: boolean };

interface PlayerListProps {
  roomId: string;
  me: string;
  users: User[];
}

export function PlayerList({ roomId, me, users }: PlayerListProps) {
  const toggleReady = async () => {
    const meUser = users.find((u) => u.nick === me);
    const newReady = !(meUser?.ready ?? false);

    await fetch("/api/ready", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomId, nick: me, ready: newReady }),
    });
  };

  return (
    <div className="w-full border-t pt-2">
      <p className="text-sm font-semibold mb-1">참가자</p>
      <ul className="flex flex-wrap gap-2 text-sm">
        {users.map((u) => (
          <li
            key={u.nick}
            className={u.ready ? "text-emerald-600 font-semibold" : ""}
          >
            {u.nick} {u.ready ? "(Ready)" : ""}
          </li>
        ))}
      </ul>
      <Button onClick={toggleReady} className="mt-2">
        {users.find((u) => u.nick === me)?.ready ? "준비 취소" : "준비"}
      </Button>
    </div>
  );
}
