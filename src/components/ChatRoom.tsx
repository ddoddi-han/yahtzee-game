"use client";

import * as React from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter } from "next/navigation";

type Message =
  | { type: "system"; text: string; at: number }
  | { type: "chat"; nick: string; text: string; at: number };

export function ChatRoom({ roomId, nick }: { roomId: string; nick: string }) {
  const router = useRouter();
  const [connected, setConnected] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [text, setText] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const url = `/api/sse?room=${encodeURIComponent(
      roomId
    )}&nick=${encodeURIComponent(nick)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as Message;
        if (["system", "chat"].includes(data.type))
          setMessages((prev) => [...prev, data]);
      } catch {}
    };
    es.onerror = () => {
      setConnected(false);
      // 자동 재시도는 EventSource 기본 동작(약 3초)
    };

    return () => {
      es.close();
    };
  }, [roomId, nick]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomId, nick, text: trimmed }),
    });
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <Card className="w-full h-fit rounded-2xl shadow-lg">
      <CardHeader className="space-y-1 gap-x-4">
        <CardTitle className="text-xl flex items-center gap-x-2 truncate">
          <span
            className={`inline-block h-2 w-2 min-w-2 rounded-full ${
              connected ? "bg-emerald-500" : "bg-gray-400"
            }`}
          />
          <span className="font-mono truncate">{roomId}</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground truncate">닉네임: {nick}</p>
        <CardAction>
          <Button
            variant="destructive"
            onClick={() => {
              localStorage.removeItem("chat_nick");
              router.push("/");
            }}
          >
            나가기
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="border-t pt-4">
        <ScrollArea className="h-[30vh] w-full rounded-md border p-3">
          <ul className="space-y-2">
            {messages.map((m, i) => {
              const time = new Date(m.at).toLocaleTimeString();
              if (m.type === "system") {
                return (
                  <li key={i} className="text-xs text-muted-foreground italic">
                    [{time}] {m.text}
                  </li>
                );
              }
              return (
                <li key={i} className="text-sm">
                  <span className="font-semibold">{m.nick}</span>
                  <span className="mx-2 text-xs text-muted-foreground align-middle">
                    ({time})
                  </span>
                  <span className="break-words">{m.text}</span>
                </li>
              );
            })}
          </ul>
          <div ref={bottomRef} />
        </ScrollArea>
      </CardContent>
      <CardFooter className="gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="메시지를 입력하고 Enter…"
          className="flex-1"
        />
        <Button onClick={send}>보내기</Button>
      </CardFooter>
    </Card>
  );
}
