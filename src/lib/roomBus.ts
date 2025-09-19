export type ServerMessage =
  | { type: "system"; text: string; at: number }
  | { type: "chat"; nick: string; text: string; at: number }
  | { type: "users"; users: { nick: string; ready: boolean }[] }
  | {
      type: "game";
      event:
        | "start-countdown"
        | "start"
        | "state"
        | "update-scores"
        | "update-turn";
      started?: boolean;
      countdown?: number | null;
      turnIndex?: number;
      scores?: Record<string, Record<string, number | null>>;
    }
  | { type: "force-exit"; reason: string };

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
  turnIndex: number;
  scores: Record<string, Record<string, number | null>>;
};

type RoomMap = Map<string, RoomState>;

// HMR/서버 재시작에도 글로벌로 보존
const g = globalThis as any;
if (!g.__rooms__) g.__rooms__ = new Map<string, RoomState>();
export const rooms: RoomMap = g.__rooms__;

const enc = new TextEncoder();

export function addClient(roomId: string, client: Client) {
  let room = rooms.get(roomId);

  if (!room) {
    room = {
      clients: new Set(),
      started: false,
      countdown: null,
      turnIndex: 0,
      scores: {},
    };
    rooms.set(roomId, room);
  }

  // 동일 nick 존재 시 이전 연결 제거
  const existing = [...room.clients].find((c) => c.nick === client.nick);
  if (existing) {
    try {
      existing.controller.enqueue(
        enc.encode(
          `data: ${JSON.stringify({
            type: "force-exit",
            reason: "duplicate",
          })}\n\n`
        )
      );
      existing.controller.close();
    } catch {}
    room.clients.delete(existing);
    client.ready = existing.ready; // ready 상태는 복사
  }

  // 새로운 플레이어 점수판 초기화
  if (!room.scores[client.nick]) {
    room.scores[client.nick] = {
      Ones: null,
      Twos: null,
      Threes: null,
      Fours: null,
      Fives: null,
      Sixes: null,
      Bonus: 0,
      FourKind: null,
      FullHouse: null,
      SmallStraight: null,
      LargeStraight: null,
      Chance: null,
      Yahtzee: null,
    };
  }

  room.clients.add(client);

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
    room = {
      clients: new Set(),
      started: false,
      countdown: null,
      turnIndex: 0,
      scores: {},
    };
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
  const allReady =
    room.clients.size >= 2 && [...room.clients].every((c) => c.ready);

  if (allReady && !room.started) {
    startCountdown(roomId);
  }
}

export function updateScores(
  roomId: string,
  nick: string,
  scores: Record<string, number | null>
) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.scores[nick] = scores;

  broadcast(roomId, {
    type: "game",
    event: "update-scores",
    scores: room.scores,
  });
  broadcastGameState(roomId);
}

export function nextTurn(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.turnIndex = (room.turnIndex + 1) % room.clients.size;

  broadcast(roomId, {
    type: "game",
    event: "update-turn",
    turnIndex: room.turnIndex,
  });
  broadcastGameState(roomId);
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
    turnIndex: room.turnIndex,
    scores: room.scores,
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
