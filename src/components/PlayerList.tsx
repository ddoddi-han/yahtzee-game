"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Play, Pause, Loader2Icon } from "lucide-react";
import { useRoom } from "@/contexts/RoomContext";

export function PlayerList() {
  const { roomId, nick: me, users, gameStarted } = useRoom();
  const [loading, setLoading] = React.useState(false);

  const meUser = React.useMemo(
    () => users.find((u) => u.nick === me),
    [users, me]
  );

  const meFirstUsers = React.useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.nick === me) return -1;
      if (b.nick === me) return 1;
      return 0;
    });
  }, [users, me]);

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
    <Card className="flex flex-col min-h-0 gap-5">
      <CardHeader>
        <CardTitle>참가자 {`(${users.length}명)`}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-auto space-y-2.5 pt-1">
        {meFirstUsers.map((u, idx) => {
          const isMe = u.nick === me;
          const needAttention = isMe && !u.ready && !gameStarted;

          return (
            <div
              key={u.nick + idx}
              className="flex justify-between items-center gap-x-2"
            >
              <div
                className={`px-2 py-1 rounded-md truncate text-sm ${
                  u.ready || gameStarted
                    ? "bg-emerald-100 text-emerald-700 font-bold"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {(u.ready || gameStarted) && "✅"} {u.nick}
              </div>

              <div className={needAttention ? "animate-wiggle" : ""}>
                <Button
                  variant={isMe ? "secondary" : "ghost"}
                  onClick={toggleReady}
                  disabled={u.nick !== me || loading || gameStarted}
                  className={
                    needAttention
                      ? "bg-gradient-to-r from-green-600 via-indigo-500 to-green-600 bg-[length:200%_200%] animate-gradient"
                      : ""
                  }
                >
                  {u.ready || gameStarted ? (
                    <Pause />
                  ) : loading ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <Play />
                  )}
                  {u.ready || gameStarted ? "준비 취소" : "준비"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
