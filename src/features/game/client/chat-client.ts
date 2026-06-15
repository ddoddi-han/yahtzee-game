import { RoomMessage } from '../shared/messages';
import { ConnectionPage } from '../shared/pagination';

export async function loadChatHistory(input: { roomId: string; before?: string; limit?: number }) {
  const res = await fetch('/api/chat/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: input.roomId,
      pagination: {
        limit: input.limit ?? 30,
        before: input.before,
      },
    }),
  });

  if (!res.ok) throw new Error('이전 메시지를 불러오지 못했습니다.');
  return (await res.json()) as ConnectionPage<RoomMessage>;
}
