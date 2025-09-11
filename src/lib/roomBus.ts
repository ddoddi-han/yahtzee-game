type ServerMessage =
  | { type: "system"; text: string; at: number }
  | { type: "chat"; nick: string; text: string; at: number }
  | { type: "users"; users: { nick: string; ready: boolean }[] }
  | {
      type: "game";
      event: "start-countdown" | "start" | "state";
      started?: boolean;
      countdown?: number | null;
    };

type Client = {
  id: string;
  nick: string;
  ready: boolean;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

type RoomState = {
  clients: Set<Client>;
  started: boolean;
  countdown: number | null;
};

type RoomMap = Map<string, RoomState>;

// HMR/서버 재시작에도 글로벌로 보존
const g = globalThis as any;
if (!g.__rooms__) g.__rooms__ = new Map<string, Set<Client>>();
export const rooms: RoomMap = g.__rooms__;

const enc = new TextEncoder();

export function addClient(roomId: string, client: Client) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), started: false, countdown: null });
  }
  rooms.get(roomId)!.clients.add(client);

  broadcastUsers(roomId);
  broadcastGameState(roomId);
}

export function removeClient(roomId: string, clientId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const c of room.clients) {
    if (c.id === clientId) {
      room.clients.delete(c);
      break;
    }
  }
  if (room.clients.size === 0) {
    rooms.delete(roomId);
  } else {
    broadcastUsers(roomId);
    broadcastGameState(roomId);
  }
}

export function broadcast(roomId: string, msg: ServerMessage) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = enc.encode(`data: ${JSON.stringify(msg)}\n\n`);
  for (const c of room.clients) {
    try {
      c.controller.enqueue(payload);
    } catch {
      // 스트림이 이미 닫혔을 수 있음
    }
  }
}

export function getRoomState(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    // 없으면 새로 생성해서 반환
    room = { clients: new Set(), started: false, countdown: null };
    rooms.set(roomId, room);
  }
  return room;
}

export function setReady(roomId: string, nick: string, ready: boolean) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const c of room.clients) {
    if (c.nick === nick) {
      c.ready = ready;
    }
  }
  broadcastUsers(roomId);

  // 모두 ready인지 확인
  if (
    room.clients.size > 0 &&
    [...room.clients].every((c) => c.ready) &&
    !room.started
  ) {
    startCountdown(roomId);
  }
}

function broadcastUsers(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const users = [...room.clients].map((c) => ({
    nick: c.nick,
    ready: c.ready,
  }));
  broadcast(roomId, { type: "users", users });
}

function broadcastGameState(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  broadcast(roomId, {
    type: "game",
    event: "state",
    started: room.started,
    countdown: room.countdown,
  });
}

function startCountdown(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  let counter = 3;
  room.countdown = counter;

  const interval = setInterval(() => {
    if (counter > 0) {
      room.countdown = counter;
      broadcast(roomId, {
        type: "game",
        event: "start-countdown",
        countdown: counter,
      });
      counter--;
    } else {
      clearInterval(interval);
      room.started = true;
      room.countdown = null;
      broadcast(roomId, { type: "game", event: "start" });
      broadcastGameState(roomId);
    }
  }, 1000);
}
