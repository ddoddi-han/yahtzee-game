import { ScoreCategory } from '../domain/categories';
import { GameSnapshot } from '../shared/messages';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export function rollDice(input: { roomId: string; nick: string }) {
  return postJson<GameSnapshot>('/api/game/roll-dice', input);
}

export function toggleHold(input: { roomId: string; nick: string; index: number }) {
  return postJson<GameSnapshot>('/api/game/hold-dice', input);
}

export function selectScore(input: { roomId: string; nick: string; category: ScoreCategory }) {
  return postJson<GameSnapshot>('/api/game/select-score', input);
}

export function restartRoom(input: { roomId: string; nick: string }) {
  return postJson<GameSnapshot>('/api/game/restart', input);
}

export function exitRoom(input: { roomId: string; nick: string }) {
  return postJson<GameSnapshot>('/api/game/exit', input);
}

export function setReady(input: { roomId: string; nick: string; ready: boolean }) {
  return postJson<GameSnapshot>('/api/ready', input);
}

export function sendChat(input: { roomId: string; nick: string; text: string }) {
  return postJson<{ ok: true }>('/api/chat', input);
}
