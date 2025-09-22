export type TDice = { value: number | null; held: boolean };
export type TUsers = { nick: string; ready: boolean }[];
export type TScores = Record<string, number | null>;

export type ServerMessage =
  | { type: "system"; text: string; at: number }
  | { type: "chat"; nick: string; text: string; at: number }
  | { type: "users"; users: TUsers }
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
      turnNick?: string | null;
      scores?: Record<string, TScores>;
      dice?: TDice[];
      rollsLeft?: number;
      lastSelected?: string;
      nick?: string;
      users?: TUsers;
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
  turnNick: string | null;
  scores: Record<string, TScores>;
  dice: TDice[];
  rollsLeft: number;
};

type RoomMap = Map<string, RoomState>;

// HMR/서버 재시작에도 글로벌로 보존
const g = globalThis as any;
if (!g.__rooms__) g.__rooms__ = new Map<string, RoomState>();
export const rooms: RoomMap = g.__rooms__;

const enc = new TextEncoder();

function createInitialDice() {
  return Array(5)
    .fill(null)
    .map(() => ({ value: null, held: false }));
}

export function addClient(roomId: string, client: Client) {
  let room = rooms.get(roomId);

  if (!room) {
    room = {
      clients: new Set(),
      started: false,
      countdown: null,
      turnNick: null,
      scores: {},
      dice: createInitialDice(),
      rollsLeft: 3,
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

  // ✅ 새로 들어온 유저한테만 현재 상태 전송
  try {
    client.controller.enqueue(
      enc.encode(
        `data: ${JSON.stringify({
          type: "game",
          event: "state",
          started: room.started,
          countdown: room.countdown,
          turnNick: room.turnNick,
          scores: room.scores,
          dice: room.dice,
          rollsLeft: room.rollsLeft,
        })}\n\n`
      )
    );
  } catch {}
}

export function removeClient(roomId: string, nick: string, immediate = false) {
  const room = rooms.get(roomId);
  if (!room) return;

  let removedPlayer: string | null = null;

  for (const c of room.clients) {
    if (c.nick === nick) {
      removedPlayer = c.nick;
      room.clients.delete(c);
      break;
    }
  }

  if (!removedPlayer) return;

  if (room.clients.size === 0) {
    rooms.delete(roomId);
    return;
  }

  if (immediate) {
    // ✅ 하드 퇴장: 바로 턴 넘김
    if (removedPlayer === room.turnNick) {
      nextTurn(roomId);
    }
    broadcastUsers(roomId);
    return;
  }

  // ✅ 소프트 퇴장: 5초 대기 후 턴 넘김
  setTimeout(() => {
    const stillMissing = ![...room.clients].some(
      (c) => c.nick === removedPlayer
    );
    if (stillMissing) {
      if (removedPlayer === room.turnNick) {
        nextTurn(roomId);
      }
      broadcastUsers(roomId);
    }
  }, 5000);
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
      turnNick: null,
      scores: {},
      dice: createInitialDice(),
      rollsLeft: 3,
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
  scores: TScores,
  lastSelected: string
) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.scores[nick] = scores;

  broadcast(roomId, {
    type: "game",
    event: "update-scores",
    scores: room.scores,
    nick,
    lastSelected,
  });
}

export function nextTurn(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const clients = [...room.clients];
  if (clients.length === 0) return;

  let currentIndex = clients.findIndex((c) => c.nick === room.turnNick);

  // 현재 턴 플레이어가 나갔으면, 그냥 다음 사람부터 시작
  if (currentIndex === -1) currentIndex = 0;

  const nextIndex = (currentIndex + 1) % clients.length;
  room.turnNick = clients[nextIndex].nick;

  room.rollsLeft = 3;
  room.dice = createInitialDice();

  broadcast(roomId, {
    type: "game",
    event: "update-turn",
    turnNick: room.turnNick,
    dice: room.dice,
    rollsLeft: room.rollsLeft,
    users: clients.map((c) => ({ nick: c.nick, ready: c.ready })),
  });
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

      // 첫 번째 턴 설정
      if (!room.turnNick) {
        const firstClient = [...room.clients][0];
        if (firstClient) room.turnNick = firstClient.nick;
      }

      broadcast(roomId, {
        type: "game",
        event: "start",
        turnNick: room.turnNick,
        dice: room.dice,
        rollsLeft: room.rollsLeft,
        scores: room.scores,
      });
    }
  }, 1000);
}
