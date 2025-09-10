export type ServerMessage =
  | { type: "system"; text: string; at: number }
  | { type: "chat"; nick: string; text: string; at: number }
  | { type: "users"; users: { nick: string; ready: boolean }[] }
  | { type: "game"; event: "start-countdown" | "start"; countdown?: number };

type Client = {
  id: string;
  nick: string;
  ready: boolean;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

type RoomMap = Map<string, Set<Client>>;

// HMR/서버 재시작에도 글로벌로 보존
const g = globalThis as any;
if (!g.__rooms__) g.__rooms__ = new Map<string, Set<Client>>();
export const rooms: RoomMap = g.__rooms__;

const enc = new TextEncoder();

export function addClient(roomId: string, client: Client) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId)!.add(client);
  broadcastUsers(roomId);
}

export function removeClient(roomId: string, clientId: string) {
  const set = rooms.get(roomId);
  if (!set) return;
  for (const c of set) {
    if (c.id === clientId) {
      set.delete(c);
      break;
    }
  }
  if (set.size === 0) rooms.delete(roomId);
  else broadcastUsers(roomId);
}

export function broadcast(roomId: string, msg: ServerMessage) {
  const set = rooms.get(roomId);
  if (!set) return;
  const payload = enc.encode(`data: ${JSON.stringify(msg)}\n\n`);
  for (const c of set) {
    try {
      c.controller.enqueue(payload);
    } catch {
      // 스트림이 이미 닫혔을 수 있음
    }
  }
}

export function setReady(roomId: string, nick: string, ready: boolean) {
  const set = rooms.get(roomId);
  if (!set) return;
  for (const c of set) {
    if (c.nick === nick) {
      c.ready = ready;
    }
  }
  broadcastUsers(roomId);

  // 모두 ready인지 확인
  if ([...set].length > 0 && [...set].every((c) => c.ready)) {
    startCountdown(roomId);
  }
}

function broadcastUsers(roomId: string) {
  const set = rooms.get(roomId);
  if (!set) return;
  const users = [...set].map((c) => ({ nick: c.nick, ready: c.ready }));
  broadcast(roomId, { type: "users", users });
}

function startCountdown(roomId: string) {
  let counter = 3;
  const interval = setInterval(() => {
    if (counter > 0) {
      broadcast(roomId, {
        type: "game",
        event: "start-countdown",
        countdown: counter,
      });
      counter--;
    } else {
      clearInterval(interval);
      broadcast(roomId, { type: "game", event: "start" });
    }
  }, 1000);
}
