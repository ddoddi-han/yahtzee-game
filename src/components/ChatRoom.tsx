'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRoomMessages } from '@/features/game/client/use-room-messages';
import { useRoomActions, useRoomConnection, useRoomSession } from '@/providers/room-provider';

export function ChatRoom() {
  const { roomId, nick } = useRoomSession();
  const { state } = useRoomConnection();
  const { sendChat } = useRoomActions();
  const { messages, hasOlderMessages, loadOlderMessages } = useRoomMessages();
  const [text, setText] = React.useState('');
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await sendChat(trimmed);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = e => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <Card className="flex flex-col min-h-0">
      <CardHeader className="gap-x-4">
        <CardTitle className="text-xl flex items-center gap-x-2 truncate">
          <span
            className={`inline-block h-2 w-2 min-w-2 rounded-full ${
              state === 'connected' ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
          />
          <span className="font-mono truncate">{roomId}</span>
        </CardTitle>
        <CardDescription>닉네임: {nick}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 border-t pt-6">
        <ScrollArea className="h-full w-full rounded-md border p-3">
          {hasOlderMessages && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-2 w-full"
              onClick={loadOlderMessages}
            >
              이전 메시지
            </Button>
          )}
          <ul className="space-y-2">
            {messages.map(m => {
              const time = new Date(m.at).toLocaleTimeString();
              if (m.type === 'system') {
                return (
                  <li key={m.id} className="text-xs text-muted-foreground italic">
                    [{time}] {m.text}
                  </li>
                );
              }
              return (
                <li key={m.id} className="text-sm">
                  <span className="font-semibold">{m.nick}</span>
                  <span className="mx-2 text-xs text-muted-foreground align-middle">({time})</span>
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
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="메시지를 입력하고 Enter…"
          className="flex-1 truncate"
        />
        <Button onClick={send}>보내기</Button>
      </CardFooter>
    </Card>
  );
}
