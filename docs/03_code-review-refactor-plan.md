# Current Code Review Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 리팩터링된 Yahtzee 코드에서 `room-provider`로 값이 과도하게 모이는 구조를 점검하고, 클라이언트 동기화, 액션 호출, 서버 room runtime의 책임을 더 깊은 Module로 정리한다.

**Architecture:** `RoomProvider`는 SSE를 열고 snapshot을 보관하는 얇은 wiring만 담당하게 하고, 화면별 데이터 선택과 서버 액션 호출은 client feature Module 뒤로 숨긴다. 서버는 `room-service`가 게임 규칙, 저장소, timer, broadcast를 모두 직접 다루는 구조에서 벗어나 순수 state transition Module과 effectful runtime Module을 분리한다.

**Code Quality:** 코드는 최대한 단순하고, 중복이 적고, 읽기 쉬워야 한다. 새 Module은 실제 복잡성을 숨길 때만 만들고, 불필요한 파일, dead code, 사용하지 않는 패키지, 임시 설정은 작업 범위 안에서 정리한다.

**Tech Stack:** Next.js App Router, React Context, TypeScript strict, Zod, Server-Sent Events, Vitest, Testing Library.

---

## 1. 리뷰 결론

`room-provider`에 파라미터가 많아지는 것 자체가 곧 문제는 아니다. 현재 서버가 방 전체 상태를 `GameSnapshot`으로 보내므로, 클라이언트 최상단에서 snapshot을 들고 있는 것은 자연스럽다.

문제는 `RoomProvider`의 Interface가 snapshot을 그대로 품지 않고 `phase`, `users`, `scores`, `turnNick`, `dice`, `rollsLeft`, `result`처럼 여러 state로 다시 펼친다는 점이다. 이 구조에서는 서버 snapshot 필드가 하나 늘 때마다 provider state, context type, provider value, 소비자 destructuring이 같이 바뀐다. 삭제 테스트를 해보면 `RoomProvider`를 지워도 복잡성이 사라지지 않고 각 화면으로 흩어진다. 즉, 지금의 provider는 필요한 Module이지만 Interface가 얕다.

현재 구조는 작동 가능한 중간 단계다. 다만 여기서 기능을 더 붙이면 `RoomProvider`가 "모든 화면이 아는 전역 방 모델"이 되고, `GameBoard`, `Dice3D`, `PlayerList`, `ChatRoom`이 각자 서버 endpoint와 request body를 알아야 하는 구조로 굳어진다.

## 2. 주요 구조 이슈

### 2.1 `RoomProvider` Interface가 넓고 얕다

**Files**

- `src/providers/room-provider.tsx`
- `src/features/game/shared/messages.ts`
- `src/components/GameBoard.tsx`
- `src/components/Dice3D.tsx`
- `src/components/ChatRoom.tsx`
- `src/components/PlayerList.tsx`

**Problem**

`RoomProvider`는 서버 snapshot을 받아서 개별 state 8개로 분해한다. 이 때문에 snapshot의 원자성이 클라이언트에서 흐려지고, 어떤 값들이 같은 서버 이벤트에서 온 것인지 Interface만 보고 알기 어렵다.

모든 소비자가 `useRoom()` 하나에 매달려 있어 chat 메시지가 추가되어도 game board, dice, player list까지 같은 context value 변경을 맞는다. 규모가 작아 지금은 큰 성능 문제는 아니지만, 유지보수 관점에서는 소비자가 자신에게 필요한 방 조각만 읽는 locality가 부족하다.

**Preferred Direction**

`RoomProvider`는 `snapshot`, `messages`, `connection`, `session`을 보관하는 sync Module로 좁힌다. 화면은 `useRoomSession()`, `useRoomSnapshot()`, `useRoomMessages()`, `useRoomActions()` 같은 작은 hook을 통해 필요한 Interface만 읽는다.

### 2.2 서버 액션 호출이 화면에 흩어져 있다

**Files**

- `src/components/GameBoard.tsx`
- `src/components/Dice3D.tsx`
- `src/components/ChatRoom.tsx`
- `src/components/PlayerList.tsx`
- `src/app/api/game/select-score/route.ts`
- `src/app/api/game/restart/route.ts`
- `src/app/api/game/roll-dice/route.ts`
- `src/app/api/game/hold-dice/route.ts`
- `src/app/api/ready/route.ts`
- `src/app/api/chat/route.ts`

**Problem**

각 화면이 endpoint path, HTTP method, body shape, error parsing을 직접 안다. 서버 입력 schema는 `api-schemas.ts`에 있지만 클라이언트 호출부에는 재사용되는 typed client가 없다.

이 구조에서는 `roomId`, `nick`이 거의 모든 화면으로 내려간다. 실제로 화면이 알아야 하는 것은 "점수 선택", "주사위 굴리기", "준비 토글", "채팅 보내기" 같은 의도인데, 현재 Interface는 request body 구성 세부사항까지 요구한다.

**Preferred Direction**

`src/features/game/client/room-client.ts`를 만들고 모든 fetch를 한 곳으로 모은다. `useRoomActions()`는 현재 session을 닫아 넣은 action 함수를 제공한다. 그러면 `GameBoard`는 `selectScore(category)`, `Dice3D`는 `rollDice()`와 `toggleHold(index)`, `PlayerList`는 `setReady(ready)`, `ChatRoom`은 `sendChat(text)`만 알면 된다.

### 2.3 chat live stream과 history pagination의 Interface가 섞여 있다

**Files**

- `src/components/ChatRoom.tsx`
- `src/providers/room-provider.tsx`
- `src/app/api/chat/history/route.ts`
- `src/features/game/shared/pagination.ts`

**Problem**

`RoomProvider`는 live SSE 메시지만 보관하고, `ChatRoom`은 older history state와 cursor를 별도로 보관한다. 이 자체는 틀리지 않지만, message list를 만드는 규칙이 화면 안에 있어서 중복 메시지 제거, cursor update, scroll behavior가 `ChatRoom`에 고정된다.

**Preferred Direction**

`useRoomMessages()`가 live messages와 loaded history를 합쳐서 제공한다. cursor pagination 호출과 중복 제거도 이 hook 안에 둔다. `ChatRoom`은 입력 UI와 rendering만 담당한다.

### 2.4 `Dice3D`는 room state와 imperative dice engine을 동시에 안다

**Files**

- `src/components/Dice3D.tsx`
- `src/types/dice-box-threejs.d.ts`
- `src/components/DiceOverlay.tsx`

**Problem**

`Dice3D`는 `useRoom()`, fetch action, DiceBox singleton, DOM id `#dice-box`, dice id mapping, roll animation timing을 모두 직접 다룬다. 이 Module의 Interface는 작지만 Implementation 안에 변동성이 큰 지식이 많아 테스트하기 어렵다.

**Preferred Direction**

`useDiceBoxAdapter()`를 만들어 DiceBox 초기화, clear, roll, add, remove, dice id mapping을 숨긴다. `Dice3D`는 `dice`, `rollsLeft`, `disabled`, `onRoll`, `onToggleHold`만 받아서 렌더링한다. 나중에 3D 엔진을 바꾸거나 canvas 문제를 디버깅할 때 locality가 좋아진다.

### 2.5 `room-service`가 게임 규칙과 runtime effect를 같이 맡는다

**Files**

- `src/features/game/server/room-service.ts`
- `src/features/game/server/room-store.ts`
- `src/features/game/server/sse-bus.ts`
- `src/features/game/domain/state.ts`

**Problem**

`room-service.ts`에는 순수 게임 규칙과 effect가 섞여 있다. 예를 들어 `setReady`는 room mutation, countdown timer 시작, snapshot broadcast를 모두 수행한다. `rollCurrentTurnDice`, `toggleHeldDie`, `selectScore`, `restartRoom`, `markDisconnected`도 mutation과 broadcast를 같이 한다.

이 구조는 route에서 쓰기 쉽지만 테스트 surface가 커진다. 게임 규칙을 테스트하려면 broadcast나 timer를 같이 고려해야 하고, timer 버그를 고치려면 game rule 파일 전체를 읽어야 한다.

**Preferred Direction**

순수 transition Module과 runtime Module을 분리한다.

- `src/features/game/domain/room-transitions.ts`: `RoomState`를 받아 상태를 바꾸거나 새 상태를 반환한다. broadcast, timer, global store를 모른다.
- `src/features/game/server/room-runtime.ts`: store lookup, timer, broadcast, route-facing orchestration을 담당한다.

### 2.6 domain state에 server runtime 타입이 들어와 있다

**Files**

- `src/features/game/domain/state.ts`
- `src/features/game/server/sse-bus.ts`
- `src/features/game/server/room-store.ts`

**Problem**

`Connection`은 SSE controller를 가진 server runtime 타입인데 `domain/state.ts`에 있다. `countdownTimer`도 domain `RoomState` 안에 있다. 이 둘은 Yahtzee 규칙이 아니라 Next.js runtime 구현 세부사항이다.

**Preferred Direction**

`Connection`은 `server/sse-bus.ts`로 옮긴다. `countdownTimer`는 `server/room-runtime.ts` 또는 `server/room-store.ts`의 별도 runtime metadata로 옮긴다. domain `RoomState`는 직렬화와 테스트가 쉬운 게임 상태만 담는다.

### 2.7 `getOrCreateRoom` 사용 위치가 과하다

**Files**

- `src/features/game/server/room-service.ts`
- `src/features/game/server/room-store.ts`

**Problem**

`sendChat`, `rollCurrentTurnDice`, `toggleHeldDie`, `selectScore`, `markDisconnected`, `restartRoom`이 모두 `getOrCreateRoom`을 쓴다. 잘못된 요청이나 disconnect 요청이 없는 방을 새로 만들 수 있다.

**Preferred Direction**

room 생성은 join flow에서만 허용한다. 나머지 action은 `requireRoom(roomId)`를 통해 존재하지 않는 방이면 `NotFoundGameError`를 던진다.

## 3. 수정 계획

### Task 1: RoomProvider를 snapshot 중심 sync Module로 축소

**Files**

- Modify: `src/providers/room-provider.tsx`
- Test: `src/providers/room-provider.test.tsx`

- [x] **Step 1: context Interface를 snapshot 중심으로 바꾼다**

`RoomContextType`를 아래 shape로 바꾼다.

```ts
type RoomConnectionState = 'connecting' | 'connected' | 'disconnected';

export type RoomContextType = {
  session: {
    roomId: string;
    nick: string;
  };
  connection: {
    state: RoomConnectionState;
  };
  snapshot: GameSnapshot | null;
  messages: RoomMessage[];
};
```

- [x] **Step 2: provider state를 `snapshot` 하나로 합친다**

`phase`, `users`, `countdown`, `scores`, `turnNick`, `dice`, `rollsLeft`, `result` 개별 state를 제거하고 `const [snapshot, setSnapshot] = React.useState<GameSnapshot | null>(null);`만 둔다.

- [x] **Step 3: SSE message 처리에서 snapshot 원자성을 보존한다**

`data.type === "snapshot"`일 때 `setSnapshot(data.snapshot)`만 호출한다. live chat/system message는 기존처럼 `messages`에 append한다.

- [x] **Step 4: provider test를 추가한다**

`EventSource` mock으로 snapshot message를 전달했을 때 `useRoomSnapshot()` 소비자가 같은 snapshot object를 읽는지 검증한다.

Run:

```bash
pnpm test src/providers/room-provider.test.tsx
```

Expected: provider test PASS.

### Task 2: 화면별 selector hook 추가

**Files**

- Modify: `src/providers/room-provider.tsx`
- Modify: `src/components/GameBoard.tsx`
- Modify: `src/components/Dice3D.tsx`
- Modify: `src/components/ChatRoom.tsx`
- Modify: `src/components/PlayerList.tsx`

- [x] **Step 1: `useRoomSession()`을 추가한다**

```ts
export function useRoomSession() {
  return useRoom().session;
}
```

- [x] **Step 2: `useRoomConnection()`을 추가한다**

```ts
export function useRoomConnection() {
  return useRoom().connection;
}
```

- [x] **Step 3: `useRoomSnapshot()`을 추가한다**

snapshot이 아직 없을 수 있으므로 hook Interface는 null을 노출한다.

```ts
export function useRoomSnapshot() {
  return useRoom().snapshot;
}
```

- [x] **Step 4: `useGameView()`를 추가한다**

GameBoard와 Dice3D가 직접 snapshot 구조를 반복해서 해석하지 않도록 derived view를 제공한다.

```ts
export function useGameView() {
  const { nick } = useRoomSession();
  const snapshot = useRoomSnapshot();
  const phase = snapshot?.phase ?? 'lobby';
  const gameStarted = phase === 'playing' || phase === 'finished';
  const turnNick = snapshot?.turnNick ?? null;
  const notMyTurn = turnNick !== nick;

  return {
    snapshot,
    phase,
    gameStarted,
    countdown: snapshot?.countdown ?? null,
    turnNick,
    notMyTurn,
    dice: snapshot?.dice ?? [],
    rollsLeft: snapshot?.rollsLeft ?? 3,
    result: snapshot?.result ?? null,
    scores: snapshot?.scores ?? {},
  };
}
```

- [x] **Step 5: consumers를 selector hook 기반으로 바꾼다**

`GameBoard`, `Dice3D`, `ChatRoom`, `PlayerList`에서 `useRoom()` 전체 destructuring을 제거한다.

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: both PASS.

### Task 3: typed room client와 `useRoomActions()` 추가

**Files**

- Create: `src/features/game/client/room-client.ts`
- Modify: `src/providers/room-provider.tsx`
- Modify: `src/components/GameBoard.tsx`
- Modify: `src/components/Dice3D.tsx`
- Modify: `src/components/ChatRoom.tsx`
- Modify: `src/components/PlayerList.tsx`

- [x] **Step 1: shared POST helper를 만든다**

```ts
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
```

- [x] **Step 2: endpoint별 client function을 만든다**

```ts
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

export function setReady(input: { roomId: string; nick: string; ready: boolean }) {
  return postJson<GameSnapshot>('/api/ready', input);
}

export function sendChat(input: { roomId: string; nick: string; text: string }) {
  return postJson<{ ok: true }>('/api/chat', input);
}
```

- [x] **Step 3: `useRoomActions()`에서 session을 닫아 넣는다**

```ts
export function useRoomActions() {
  const { roomId, nick } = useRoomSession();

  return React.useMemo(
    () => ({
      rollDice: () => roomClient.rollDice({ roomId, nick }),
      toggleHold: (index: number) => roomClient.toggleHold({ roomId, nick, index }),
      selectScore: (category: ScoreCategory) => roomClient.selectScore({ roomId, nick, category }),
      restartRoom: () => roomClient.restartRoom({ roomId, nick }),
      setReady: (ready: boolean) => roomClient.setReady({ roomId, nick, ready }),
      sendChat: (text: string) => roomClient.sendChat({ roomId, nick, text }),
    }),
    [roomId, nick]
  );
}
```

- [x] **Step 4: components에서 직접 fetch를 제거한다**

각 화면은 `useRoomActions()`의 action만 호출한다. endpoint path와 request body shape는 화면에서 사라져야 한다.

Run:

```bash
rg "fetch\\(" src/components src/providers
pnpm lint
pnpm typecheck
```

Expected: `fetch(` 검색 결과는 provider의 SSE 생성이나 client Module을 제외하고 없어야 한다. lint/typecheck PASS.

### Task 4: `useRoomMessages()`로 live/history message를 합친다

**Files**

- Create: `src/features/game/client/chat-client.ts`
- Modify: `src/providers/room-provider.tsx`
- Modify: `src/components/ChatRoom.tsx`
- Test: `src/features/game/client/use-room-messages.test.tsx`

- [x] **Step 1: chat history client를 분리한다**

`loadChatHistory({ roomId, before, limit })`를 만들고 `/api/chat/history` body 구성을 한 곳으로 모은다.

- [x] **Step 2: `useRoomMessages()` hook을 만든다**

hook은 `messages`, `hasOlderMessages`, `loadOlderMessages`를 반환한다. history와 live messages를 합칠 때 `id` 기준으로 중복 제거한다.

- [x] **Step 3: `ChatRoom`에서 pagination state를 제거한다**

`ChatRoom`은 `const { messages, hasOlderMessages, loadOlderMessages } = useRoomMessages();`만 사용한다.

Run:

```bash
pnpm test src/features/game/client/use-room-messages.test.tsx
```

Expected: history/live merge, duplicate removal, cursor update tests PASS.

### Task 5: DiceBox Adapter 분리

**Files**

- Create: `src/features/game/client/use-dice-box-adapter.ts`
- Modify: `src/components/Dice3D.tsx`
- Test: `src/features/game/client/use-dice-box-adapter.test.tsx`

- [x] **Step 1: DiceBox imperative operations를 hook으로 이동한다**

hook Interface는 아래 정도로 제한한다.

```ts
type DiceBoxAdapter = {
  mount: (selector: string) => void;
  clear: () => void;
  rollValues: (values: DiceValue[], originIndexes: number[]) => void;
  removeByEngineId: (engineId: number) => Promise<void>;
  onDiceClick: (handler: (originIndex: number) => void) => void;
};
```

- [x] **Step 2: `Dice3D`는 room action과 render만 담당하게 한다**

`Dice3D`에서 DiceBox constructor, `diceIdToIndex`, `box.roll`, `box.add`, `box.remove` 직접 호출을 제거한다.

- [x] **Step 3: adapter test를 추가한다**

DiceBox fake adapter를 사용해 engine dice id가 origin index로 매핑되는지 검증한다.

Run:

```bash
pnpm test src/features/game/client/use-dice-box-adapter.test.tsx
pnpm typecheck
```

Expected: tests/typecheck PASS.

### Task 6: `room-service`를 transition과 runtime으로 분리

**Files**

- Create: `src/features/game/domain/room-transitions.ts`
- Create: `src/features/game/server/room-runtime.ts`
- Modify: `src/features/game/server/room-service.ts`
- Modify: `src/features/game/server/room-service.test.ts`

- [x] **Step 1: 순수 transition 함수를 이동한다**

아래 함수들은 broadcast, timer, store lookup 없이 `RoomState`만 다루게 한다.

```ts
export function setReadyState(room: RoomState, nick: string, ready: boolean): void;
export function startGame(room: RoomState): void;
export function rollCurrentTurn(room: RoomState, nick: string): void;
export function toggleHeldDie(room: RoomState, nick: string, index: number): void;
export function applyScoreSelection(
  room: RoomState,
  input: { nick: string; category: ScoreCategory }
): void;
export function markPlayerDisconnected(room: RoomState, nick: string): void;
export function resetRoomForRestart(room: RoomState): void;
```

- [x] **Step 2: route-facing function은 runtime에 둔다**

`room-runtime.ts`는 `requireRoom`, `getOrCreateRoom`, `broadcastSnapshot`, `startCountdownTimer`를 조합한다.

- [x] **Step 3: 기존 `room-service.ts`는 compatibility export만 남기거나 제거한다**

route imports를 `room-runtime.ts`로 바꿀 수 있으면 `room-service.ts`를 제거한다. 한 번에 migration하기 어렵다면 기존 이름을 re-export하는 얇은 Module로 만든다.

- [x] **Step 4: transition test를 effect 없이 검증한다**

기존 `room-service.test.ts`의 scoring, turn advance, countdown 조건 테스트를 `room-transitions.test.ts`로 옮긴다. broadcast mock 없이 실행되어야 한다.

Run:

```bash
pnpm test src/features/game/domain/room-transitions.test.ts
pnpm test src/features/game/server/room-service.test.ts
```

Expected: transition tests and runtime tests PASS.

### Task 7: domain state에서 runtime 타입 제거

**Files**

- Modify: `src/features/game/domain/state.ts`
- Modify: `src/features/game/server/sse-bus.ts`
- Modify: `src/features/game/server/room-store.ts`
- Modify: `src/features/game/server/room-runtime.ts`

- [x] **Step 1: `Connection` type을 `sse-bus.ts`로 옮긴다**

`domain/state.ts`는 `ReadableStreamDefaultController`를 import하거나 알면 안 된다.

- [x] **Step 2: `countdownTimer`를 server runtime metadata로 옮긴다**

예상 shape:

```ts
type RoomRuntimeState = {
  countdownTimer: ReturnType<typeof setInterval> | null;
};
```

`room-store.ts`는 `rooms`와 별개로 `roomRuntimes` map을 관리한다.

- [x] **Step 3: domain `RoomState`를 직렬화 가능한 값으로 제한한다**

`RoomState`에는 `roomId`, `phase`, `players`, `turnOrder`, `turnIndex`, `dice`, `rollsLeft`, `countdown`, `result`, `events`만 남긴다.

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: both PASS.

### Task 8: room 생성과 존재 검증을 명확히 분리

**Files**

- Modify: `src/features/game/server/room-store.ts`
- Modify: `src/features/game/server/room-runtime.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/game/roll-dice/route.ts`
- Modify: `src/app/api/game/hold-dice/route.ts`
- Modify: `src/app/api/game/select-score/route.ts`
- Modify: `src/app/api/game/restart/route.ts`

- [x] **Step 1: `requireRoom(roomId)`를 추가한다**

```ts
export function requireRoom(roomId: string) {
  const room = peekRoom(roomId);
  if (!room) throw new NotFoundGameError('방을 찾을 수 없습니다.');
  return room;
}
```

- [x] **Step 2: join을 제외한 action에서 `getOrCreateRoom` 사용을 제거한다**

`getOrCreateRoom`는 `joinRoom` path에서만 사용한다.

- [x] **Step 3: 없는 방 action test를 추가한다**

roll, chat, restart가 없는 room을 만들지 않고 NotFound error를 반환하는지 검증한다.

Run:

```bash
pnpm test src/features/game/server/room-service.test.ts
```

Expected: missing room action tests PASS.

### Task 9: SSE join/reconnect semantics 정리

**Files**

- Modify: `src/app/api/sse/route.ts`
- Modify: `src/features/game/server/room-runtime.ts`
- Modify: `src/features/game/server/sse-bus.ts`
- Test: `src/features/game/server/room-service.test.ts`

- [x] **Step 1: join과 reconnect를 분리한다**

새 플레이어 입장일 때만 system event를 추가한다. 같은 nick 재연결은 `connected = true`만 갱신하고 "입장했습니다" 메시지를 반복 생성하지 않는다.

- [x] **Step 2: initial snapshot 중복 전송을 제거한다**

SSE route에서 `joinRoom`이 broadcast를 수행한다면 별도 `sendToConnection(snapshot)`를 제거한다. 또는 `joinRoom`은 snapshot만 반환하고 route가 initial send와 broadcast를 명확히 수행한다. 둘 중 하나만 선택한다.

- [x] **Step 3: duplicate tab force-exit flow를 테스트한다**

같은 room/nick으로 두 연결이 들어오면 이전 연결에 `force-exit`이 전송되고 connection map에는 새 연결만 남아야 한다.

Run:

```bash
pnpm test src/features/game/server/room-service.test.ts
pnpm typecheck
```

Expected: tests/typecheck PASS.

### Task 10: Prettier와 Git quality gate 추가

**Files**

- Create: `prettier.config.mjs`
- Create: `.prettierignore`
- Create: `lint-staged.config.mjs`
- Create: `.husky/pre-commit`
- Create: `.husky/pre-push`
- Modify: `package.json`
- Modify: `eslint.config.mjs`

- [x] **Step 1: Prettier 설정을 추가한다**

`prettier.config.mjs`를 추가하고 저장소 전체가 같은 formatting rule을 쓰게 한다. generated file, build output, dependency directory는 `.prettierignore`에 둔다.

- [x] **Step 2: package scripts를 추가한다**

필수 scripts:

```json
{
  "format": "prettier . --write",
  "format:check": "prettier . --check",
  "lint:fix": "eslint . --fix",
  "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build",
  "prepare": "husky"
}
```

- [x] **Step 3: ESLint와 Prettier 충돌을 막는다**

`eslint-config-prettier/flat`을 `eslint.config.mjs` 마지막에 추가한다.

- [x] **Step 4: commit 시 staged 파일에 Prettier와 lint를 적용한다**

`.husky/pre-commit`은 `pnpm exec lint-staged`를 실행한다. `lint-staged.config.mjs`는 code file에 `eslint --fix`와 `prettier --write`를 적용하고, markdown/json/css/yaml에는 `prettier --write`를 적용한다.

- [x] **Step 5: push 전에 formatting/lint/typecheck/test를 통과시킨다**

`.husky/pre-push`는 아래 명령을 실행한다.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Expected: formatting, lint, typecheck, test 중 하나라도 실패하면 push가 중단된다.

- [x] **Step 6: 불필요한 파일과 패키지를 정리한다**

작업 중 생긴 임시 파일, 사용하지 않는 package, 사용하지 않는 설정 파일은 남기지 않는다. 특히 보안 audit을 강제로 조용하게 만드는 임시 overrides는 사용자 결정 없이 추가하지 않는다.

Run:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all PASS.

### Task 11: 최종 검증

**Files**

- Verify only.

- [x] **Step 1: 정적 검증을 실행한다**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS.

- [x] **Step 2: smoke test를 실행한다**

```bash
pnpm dev
curl -I http://localhost:4000
curl -I http://localhost:4000/testroom
curl -X POST http://localhost:4000/api/check-room \
  -H 'Content-Type: application/json' \
  -d '{"roomId":"smoke","nick":"alice"}'
```

Expected:

- `/` returns 200
- `/testroom` returns 200
- `/api/check-room` returns `{"ok":true}`

- [x] **Step 3: audit 상태를 기록한다**

```bash
pnpm audit --audit-level=moderate
```

Expected: overrides를 쓰지 않으면 transitive `postcss` 또는 `esbuild` advisory가 남을 수 있다. 결과를 PR/commit message에 명시한다. 불필요한 package와 파일이 남아 있으면 제거한다.

## 4. 우선순위

1. Task 1-3을 먼저 한다. `room-provider`의 넓은 Interface와 fetch 분산을 줄이는 것이 지금 질문의 핵심이다.
2. Task 8-9를 다음으로 한다. 없는 방 생성과 SSE reconnect 의미는 서버 안정성에 직접 영향을 준다.
3. Task 6-7은 구조 개선 폭이 크므로 별도 commit으로 진행한다. 게임 규칙과 runtime effect가 분리되면 테스트 locality가 크게 좋아진다.
4. Task 10은 실제 코드 변경 전이나 첫 리팩터링 commit 전에 적용한다. formatting과 lint gate가 먼저 있어야 이후 변경의 품질 기준이 흔들리지 않는다.
5. Task 4-5는 UI/UX 변경 가능성이 있으므로 마지막에 한다. 특히 DiceBox adapter는 수동 확인이 필요하다.

## 5. 완료 기준

- `RoomProvider` context value가 `session`, `connection`, `snapshot`, `messages` 수준으로 축소된다.
- 화면 Module에서 직접 `fetch`를 호출하지 않는다.
- `roomId`, `nick` request body 조립은 `useRoomActions()` 또는 client Module 안에만 있다.
- domain `RoomState`가 SSE controller나 timer id를 알지 않는다.
- join 외 action은 없는 방을 새로 만들지 않는다.
- code path는 단순하고 중복이 적으며, 읽는 사람이 한 번에 의도를 파악할 수 있다.
- 불필요한 파일, 사용하지 않는 package, 임시 설정, dead code가 남아 있지 않다.
- format:check, lint, typecheck, test, build가 통과한다.
