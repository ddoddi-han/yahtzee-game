"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Play, Pause } from "lucide-react";
import { useRoom } from "@/contexts/RoomContext";

export function PlayerList() {
  const { roomId, nick: me, users, gameStarted } = useRoom();
  const [loading, setLoading] = React.useState(false);

  const meUser = React.useMemo(
    () => users.find((u) => u.nick === me),
    [users, me]
  );

  const toggleReady = async () => {
    if (!meUser) return;
    const newReady = !meUser.ready;

    try {
      setLoading(true);
      await fetch("/api/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomId, nick: me, ready: newReady }),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>참가자 {`(${users.length}명)`}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {users.map((u, idx) => (
            <div
              key={u.nick + idx}
              className="flex justify-between items-center gap-x-2"
            >
              <div
                className={`px-2 py-1 rounded-md truncate text-sm ${
                  u.ready
                    ? "bg-emerald-100 text-emerald-700 font-semibold"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {u.ready && "✅"} {u.nick}
              </div>
              <Button
                variant={u.nick === me ? "secondary" : "ghost"}
                onClick={toggleReady}
                disabled={u.nick !== me || loading || gameStarted}
              >
                {u.ready || gameStarted ? <Pause /> : <Play />}
                {u.ready || gameStarted ? "준비 취소" : "준비"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
