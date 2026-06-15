# Yahtzee Game Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 미완성 Yahtzee 멀티플레이 프로토타입을 서버 권위 게임 상태 머신, 검증된 API, 안정적인 SSE 동기화, 게임 종료/결과, 테스트/빌드 통과, 보안 패치가 적용된 구조로 전체 리팩토링한다.

**Architecture:** 클라이언트가 점수판 전체를 제출하는 현재 구조를 제거하고, 서버가 `category` 입력만 받아 현재 주사위와 게임 상태로 점수를 계산한다. `roomBus.ts`에 섞여 있는 player, connection, game rule, broadcast 책임을 `domain`, `server`, `realtime`, `pagination` 모듈로 분리한다. 채팅/이벤트 히스토리는 offset/page 번호를 금지하고, request body의 typed input 기반 cursor pagination만 지원한다.

**Tech Stack:** Next.js App Router, React, TypeScript strict, Zod, Tailwind CSS v4, shadcn/Radix UI, Server-Sent Events, Vitest, Testing Library, Playwright.

---

## 0. 기준 정보

이 계획은 `research.md`와 실제 소스 파일을 기준으로 작성했다.

현재 핵심 문제:

- `src/app/api/game/select-score/route.ts`가 현재 턴, 카테고리, 주사위, 기존 점수 상태를 검증하지 않는다.
- `src/components/ScoreTable.tsx`가 클라이언트에서 점수를 계산하고 `scores` 전체를 서버로 보낸다.
- 보너스 자동 처리 effect가 `/api/game/select-score`를 호출해서 턴을 잘못 넘길 수 있다.
- `src/lib/roomBus.ts`가 플레이어, SSE 연결, 게임 상태, 점수, 턴, 카운트다운, 퇴장을 모두 맡고 있다.
- 게임 종료/승자 계산/재시작이 없다.
- 시작된 방 입장을 SSE 레벨에서 막지 않는다.
- 카운트다운 취소/중복 방지가 없다.
- 테스트가 없다.
- `pnpm lint`와 `pnpm build`가 실패한다.
- `next@15.5.2`는 현재 audit 기준 취약하다.

보안/버전 조사 결과:

- `pnpm audit --audit-level=moderate --json` 승인 실행 결과: 취약점 합계 `critical 1`, `high 26`, `moderate 16`, `low 2`. 주요 원인은 `next@15.5.2`.
- GitHub Next.js advisory는 `15.5.2`가 React Server Components RCE 계열에 취약하며 `15.5.7+`에서 1차 패치됐다고 명시한다.
- React 공식 보안 공지는 React Server Components RCE가 `19.1.0`에 영향을 주며 `19.1.2+`에서 1차 패치됐다고 명시한다.
- React 공식 후속 공지는 DoS/Source Code Exposure 추가 패치 후 안전 버전을 `19.0.4`, `19.1.5`, `19.2.4`로 안내한다.
- 2026-05-28 기준 npm registry latest:
  - `next@16.2.6`
  - `react@19.2.6`
  - `react-dom@19.2.6`
- Next.js `16.2.6`의 npm metadata는 Node `>=20.9.0`을 요구한다. 현재 로컬 `node --version`은 `v22.11.0`이라 충족한다.

보안 참고 링크:

- https://github.com/vercel/next.js/security/advisories
- https://github.com/vercel/next.js/security/advisories/GHSA-9qr9-h5gf-34mp
- https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
- https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components
- https://registry.npmjs.org/next/latest
- https://registry.npmjs.org/react/latest
- https://registry.npmjs.org/react-dom/latest

## 1. 목표 아키텍처

### 1.1 파일 구조

새 구조는 기존 App Router와 shadcn 컴포넌트는 유지하고, 게임 도메인만 분리한다.

```txt
src/
  app/
    api/
      chat/
        route.ts
        history/route.ts
      check-room/route.ts
      game/
        exit/route.ts
        hold-dice/route.ts
        roll-dice/route.ts
        select-score/route.ts
        restart/route.ts
      ready/route.ts
      sse/route.ts
  components/
    ChatRoom.tsx
    Dice3D.tsx
    GameBoard.tsx
    PlayerList.tsx
    ScoreTable.tsx
  features/
    game/
      domain/
        categories.ts
        dice.ts
        errors.ts
        scoring.ts
        state.ts
      server/
        api-schemas.ts
        room-store.ts
        room-service.ts
        sse-bus.ts
      shared/
        messages.ts
        pagination.ts
  providers/
    room-provider.tsx
```

### 1.2 도메인 원칙

- 클라이언트는 점수를 계산하지 않는다. 클라이언트는 `category`만 선택한다.
- 서버는 현재 턴, 현재 주사위, 굴림 여부, 이미 채점된 카테고리 여부, 게임 phase를 검증한다.
- `Bonus`는 선택 이벤트가 아니다. 서버가 상단 점수 변경 후 파생 값으로 계산한다.
- `players`와 `connections`를 분리한다. 연결이 끊겨도 플레이어 상태가 바로 사라지지 않는다.
- 카운트다운은 room phase와 timer id로 관리하며 취소 가능해야 한다.
- 게임 종료는 상태 머신의 결과다. 모든 active player의 scoring category가 채워지면 `finished`로 전환한다.
- 페이징은 offset/page number를 금지한다. 모든 히스토리 조회 API는 input object 기반 cursor pagination을 사용한다.

### 1.3 도메인 규칙 결정

이 리팩토링은 현재 구현과 사용자 기대를 맞춰 **13카테고리 전통 Yahtzee에 가까운 규칙**으로 확장한다.

카테고리:

- Upper: `Ones`, `Twos`, `Threes`, `Fours`, `Fives`, `Sixes`
- Lower: `ThreeKind`, `FourKind`, `FullHouse`, `SmallStraight`, `LargeStraight`, `Chance`, `Yahtzee`
- Derived: `Bonus`

점수 규칙:

- `ThreeKind`: 같은 눈 3개 이상이면 전체 합, 아니면 0
- `FourKind`: 같은 눈 4개 이상이면 전체 합, 아니면 0
- `FullHouse`: 3개 + 2개면 25, Yahtzee를 FullHouse로 인정하지 않는다.
- `SmallStraight`: 연속 4개면 30
- `LargeStraight`: 연속 5개면 40
- `Yahtzee`: 5개 같으면 50
- Yahtzee bonus/Joker는 이번 리팩토링 범위에서 제외한다. 단, `categories.ts`에 확장 포인트를 남긴다.

## 2. 핵심 코드 스니펫

이 섹션은 구현 중 그대로 사용할 기준 코드다. 실제 작업에서는 task 순서에 맞춰 파일을 생성/수정한다.

### 2.1 `src/features/game/domain/categories.ts`

```ts
export const UPPER_CATEGORIES = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'] as const;

export const LOWER_CATEGORIES = [
  'ThreeKind',
  'FourKind',
  'FullHouse',
  'SmallStraight',
  'LargeStraight',
  'Chance',
  'Yahtzee',
] as const;

export const SCORE_CATEGORIES = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES] as const;

export type UpperCategory = (typeof UPPER_CATEGORIES)[number];
export type LowerCategory = (typeof LOWER_CATEGORIES)[number];
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export type ScoreSheet = Record<ScoreCategory, number | null> & {
  Bonus: number;
};

export const CATEGORY_LABELS: Record<ScoreCategory | 'Bonus', string> = {
  Ones: 'Ones',
  Twos: 'Twos',
  Threes: 'Threes',
  Fours: 'Fours',
  Fives: 'Fives',
  Sixes: 'Sixes',
  Bonus: 'Bonus (+35)',
  ThreeKind: 'Three of a Kind',
  FourKind: 'Four of a Kind',
  FullHouse: 'Full House',
  SmallStraight: 'Small Straight',
  LargeStraight: 'Large Straight',
  Chance: 'Chance',
  Yahtzee: 'Yahtzee',
};

export function createEmptyScoreSheet(): ScoreSheet {
  return {
    Ones: null,
    Twos: null,
    Threes: null,
    Fours: null,
    Fives: null,
    Sixes: null,
    Bonus: 0,
    ThreeKind: null,
    FourKind: null,
    FullHouse: null,
    SmallStraight: null,
    LargeStraight: null,
    Chance: null,
    Yahtzee: null,
  };
}
```

### 2.2 `src/features/game/domain/scoring.ts`

```ts
import { SCORE_CATEGORIES, ScoreCategory, ScoreSheet, UPPER_CATEGORIES } from './categories';

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type RolledDice = [DiceValue, DiceValue, DiceValue, DiceValue, DiceValue];

const UPPER_FACE_BY_CATEGORY = {
  Ones: 1,
  Twos: 2,
  Threes: 3,
  Fours: 4,
  Fives: 5,
  Sixes: 6,
} as const;

function sum(dice: readonly DiceValue[]) {
  return dice.reduce((total, value) => total + value, 0);
}

function counts(dice: readonly DiceValue[]) {
  return dice.reduce<Record<DiceValue, number>>(
    (acc, value) => {
      acc[value] += 1;
      return acc;
    },
    { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  );
}

function hasStraight(dice: readonly DiceValue[], length: 4 | 5) {
  const values = new Set(dice);
  const runs =
    length === 4
      ? [
          [1, 2, 3, 4],
          [2, 3, 4, 5],
          [3, 4, 5, 6],
        ]
      : [
          [1, 2, 3, 4, 5],
          [2, 3, 4, 5, 6],
        ];

  return runs.some(run => run.every(value => values.has(value as DiceValue)));
}

export function calculateScore(category: ScoreCategory, dice: RolledDice) {
  const face = UPPER_FACE_BY_CATEGORY[category as keyof typeof UPPER_FACE_BY_CATEGORY];
  if (face) {
    return dice.filter(value => value === face).reduce((total, value) => total + value, 0);
  }

  const frequencies = Object.values(counts(dice));

  switch (category) {
    case 'ThreeKind':
      return frequencies.some(count => count >= 3) ? sum(dice) : 0;
    case 'FourKind':
      return frequencies.some(count => count >= 4) ? sum(dice) : 0;
    case 'FullHouse':
      return frequencies.includes(3) && frequencies.includes(2) ? 25 : 0;
    case 'SmallStraight':
      return hasStraight(dice, 4) ? 30 : 0;
    case 'LargeStraight':
      return hasStraight(dice, 5) ? 40 : 0;
    case 'Chance':
      return sum(dice);
    case 'Yahtzee':
      return frequencies.includes(5) ? 50 : 0;
    default:
      category satisfies never;
      return 0;
  }
}

export function calculateUpperTotal(scoreSheet: ScoreSheet) {
  return UPPER_CATEGORIES.reduce((total, category) => total + (scoreSheet[category] ?? 0), 0);
}

export function calculateBonus(scoreSheet: ScoreSheet) {
  return calculateUpperTotal(scoreSheet) >= 63 ? 35 : 0;
}

export function calculateTotal(scoreSheet: ScoreSheet) {
  return SCORE_CATEGORIES.reduce(
    (total, category) => total + (scoreSheet[category] ?? 0),
    scoreSheet.Bonus
  );
}

export function isScoreSheetComplete(scoreSheet: ScoreSheet) {
  return SCORE_CATEGORIES.every(category => scoreSheet[category] !== null);
}
```

### 2.3 `src/features/game/domain/state.ts`

```ts
import { ScoreSheet } from './categories';
import { DiceValue } from './scoring';

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'finished';

export type Die = {
  value: DiceValue | null;
  held: boolean;
};

export type Player = {
  nick: string;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  scoreSheet: ScoreSheet;
};

export type Connection = {
  id: string;
  nick: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export type GameResult = {
  totals: Record<string, number>;
  winners: string[];
  finishedAt: number;
};

export type RoomEvent = {
  id: string;
  roomId: string;
  type: 'system' | 'chat' | 'game';
  nick?: string;
  text?: string;
  at: number;
};

export type RoomState = {
  roomId: string;
  phase: RoomPhase;
  players: Map<string, Player>;
  turnOrder: string[];
  turnIndex: number;
  dice: Die[];
  rollsLeft: number;
  countdown: number | null;
  countdownTimer: ReturnType<typeof setInterval> | null;
  result: GameResult | null;
  events: RoomEvent[];
};

export function createInitialDice(): Die[] {
  return Array.from({ length: 5 }, () => ({ value: null, held: false }));
}
```

### 2.4 `src/features/game/server/api-schemas.ts`

```ts
import { z } from 'zod';
import { SCORE_CATEGORIES } from '../domain/categories';

export const roomIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const nickSchema = z.string().trim().min(1).max(10);

export const joinRoomInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
});

export const readyInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  ready: z.boolean(),
});

export const rollDiceInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
});

export const holdDiceInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  index: z.number().int().min(0).max(4),
});

export const selectScoreInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  category: z.enum(SCORE_CATEGORIES),
});

export const sendChatInputSchema = z.object({
  roomId: roomIdSchema,
  nick: nickSchema,
  text: z.string().trim().min(1).max(2000),
});
```

### 2.5 Input 기반 cursor pagination

Offset/page 기반 API를 만들지 않는다. 요청 body는 항상 `pagination` input object를 받는다.

`src/features/game/shared/pagination.ts`

```ts
import { z } from 'zod';

export const paginationInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(30),
    before: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
  })
  .refine(input => !(input.before && input.after), {
    message: 'Use either before or after, not both.',
    path: ['before'],
  });

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export type PageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

export type ConnectionPage<T> = {
  nodes: T[];
  pageInfo: PageInfo;
};

export function encodeCursor(item: { at: number; id: string }) {
  return Buffer.from(JSON.stringify({ at: item.at, id: item.id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string) {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    at: number;
    id: string;
  };

  if (!Number.isFinite(parsed.at) || !parsed.id) {
    throw new Error('Invalid cursor');
  }

  return parsed;
}

export function pageByInput<T extends { at: number; id: string }>(
  items: readonly T[],
  input: PaginationInput
): ConnectionPage<T> {
  const sorted = [...items].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  const cursor = input.before ?? input.after;
  const decoded = cursor ? decodeCursor(cursor) : null;

  const filtered = decoded
    ? sorted.filter(item => {
        if (input.before)
          return item.at < decoded.at || (item.at === decoded.at && item.id < decoded.id);
        return item.at > decoded.at || (item.at === decoded.at && item.id > decoded.id);
      })
    : sorted;

  const nodes = filtered.slice(0, input.limit);
  const startCursor = nodes[0] ? encodeCursor(nodes[0]) : null;
  const endCursor = nodes[nodes.length - 1] ? encodeCursor(nodes[nodes.length - 1]) : null;

  return {
    nodes,
    pageInfo: {
      hasNextPage: filtered.length > input.limit,
      hasPreviousPage: Boolean(cursor),
      startCursor,
      endCursor,
    },
  };
}
```

`src/app/api/chat/history/route.ts`

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { roomIdSchema } from '@/features/game/server/api-schemas';
import { getRoomSnapshot } from '@/features/game/server/room-service';
import { pageByInput, paginationInputSchema } from '@/features/game/shared/pagination';

const chatHistoryInputSchema = z.object({
  roomId: roomIdSchema,
  pagination: paginationInputSchema.default({ limit: 30 }),
});

export async function POST(req: Request) {
  const input = chatHistoryInputSchema.parse(await req.json());
  const room = getRoomSnapshot(input.roomId);
  const chatEvents = room.events.filter(event => event.type === 'chat' || event.type === 'system');

  return NextResponse.json(pageByInput(chatEvents, input.pagination));
}
```

금지할 API 형태:

```ts
// 금지: offset/page 기반
GET /api/chat/history?roomId=abc&page=2&offset=30

// 허용: input 기반 cursor pagination
POST /api/chat/history
{
  "roomId": "abc",
  "pagination": {
    "limit": 30,
    "before": "eyJhdCI6MTc..."
  }
}
```

## 3. 구현 계획

### Task 1: 의존성 보안 패치와 빌드 기준 정리

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `next.config.ts`

- [ ] **Step 1: 현재 취약점 재확인**

Run:

```bash
pnpm audit --audit-level=moderate --json
```

Expected:

- 현재 `next@15.5.2` 관련 취약점이 표시된다.
- audit 결과가 0이 아니어도 이 단계는 현황 수집이 목적이다.

- [ ] **Step 2: Next/React 업그레이드**

권장 명령:

```bash
pnpm add next@16.2.6 react@19.2.6 react-dom@19.2.6
pnpm add -D eslint-config-next@16.2.6
```

보수적 대안:

```bash
pnpm add next@15.5.16 react@19.2.6 react-dom@19.2.6
pnpm add -D eslint-config-next@15.5.16
```

권장안은 `16.2.6`이다. 현재 Node `v22.11.0`이므로 Next 16의 Node `>=20.9.0` 요구조건을 만족한다.

- [ ] **Step 3: Next root 경고 제거**

Modify `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
```

- [ ] **Step 4: 검증**

Run:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm audit --audit-level=moderate
```

Expected:

- 이 task 직후 lint는 기존 `any`와 hook 경고 때문에 아직 실패할 수 있다.
- `pnpm audit`는 Next 관련 critical/high 항목이 사라져야 한다.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts
git commit -m "chore: upgrade framework dependencies"
```

### Task 2: 테스트 인프라 추가

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/features/game/domain/scoring.test.ts`

- [ ] **Step 1: 테스트 의존성 설치**

```bash
pnpm add -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test
```

- [ ] **Step 2: package scripts 추가**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev -p 4000 --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

- [ ] **Step 3: Vitest 설정 생성**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: 첫 실패 테스트 추가**

Create `src/features/game/domain/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createEmptyScoreSheet } from './categories';
import { calculateBonus, calculateScore, calculateTotal, isScoreSheetComplete } from './scoring';

describe('Yahtzee scoring', () => {
  it('scores upper categories', () => {
    expect(calculateScore('Threes', [3, 3, 1, 5, 3])).toBe(9);
  });

  it('scores lower categories', () => {
    expect(calculateScore('ThreeKind', [2, 2, 2, 5, 6])).toBe(17);
    expect(calculateScore('FourKind', [4, 4, 4, 4, 1])).toBe(17);
    expect(calculateScore('FullHouse', [2, 2, 3, 3, 3])).toBe(25);
    expect(calculateScore('SmallStraight', [1, 2, 3, 4, 6])).toBe(30);
    expect(calculateScore('LargeStraight', [2, 3, 4, 5, 6])).toBe(40);
    expect(calculateScore('Chance', [1, 2, 3, 4, 6])).toBe(16);
    expect(calculateScore('Yahtzee', [5, 5, 5, 5, 5])).toBe(50);
  });

  it('keeps bonus derived from upper total', () => {
    const sheet = createEmptyScoreSheet();
    sheet.Ones = 3;
    sheet.Twos = 6;
    sheet.Threes = 9;
    sheet.Fours = 12;
    sheet.Fives = 15;
    sheet.Sixes = 18;
    expect(calculateBonus(sheet)).toBe(35);
  });

  it('calculates total and completion', () => {
    const sheet = createEmptyScoreSheet();
    for (const key of Object.keys(sheet)) {
      if (key !== 'Bonus') sheet[key as keyof typeof sheet] = 0;
    }
    sheet.Bonus = 35;
    expect(calculateTotal(sheet)).toBe(35);
    expect(isScoreSheetComplete(sheet)).toBe(true);
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run:

```bash
pnpm test
```

Expected:

- `src/features/game/domain/categories.ts` 또는 `scoring.ts`가 없어서 실패한다.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/setup.ts src/features/game/domain/scoring.test.ts
git commit -m "test: add scoring test harness"
```

### Task 3: 도메인 타입과 점수 계산 모듈 추가

**Files:**

- Create: `src/features/game/domain/categories.ts`
- Create: `src/features/game/domain/scoring.ts`
- Create: `src/features/game/domain/dice.ts`
- Create: `src/features/game/domain/errors.ts`
- Create: `src/features/game/domain/state.ts`
- Test: `src/features/game/domain/scoring.test.ts`

- [ ] **Step 1: categories/scoring 구현**

Use snippets from sections 2.1 and 2.2.

- [ ] **Step 2: dice helper 구현**

Create `src/features/game/domain/dice.ts`:

```ts
import { Die, createInitialDice } from './state';
import { DiceValue, RolledDice } from './scoring';

export function rollDie(): DiceValue {
  return (Math.floor(Math.random() * 6) + 1) as DiceValue;
}

export function rollDice(dice: readonly Die[]): Die[] {
  return dice.map(die => (die.held ? die : { ...die, value: rollDie() }));
}

export function assertRolledDice(dice: readonly Die[]): RolledDice {
  if (dice.length !== 5 || dice.some(die => die.value === null)) {
    throw new Error('Dice must be rolled before scoring.');
  }

  return dice.map(die => die.value) as RolledDice;
}

export function resetDice() {
  return createInitialDice();
}
```

- [ ] **Step 3: 도메인 에러 구현**

Create `src/features/game/domain/errors.ts`:

```ts
export class GameError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export class ForbiddenGameActionError extends GameError {
  constructor(message = 'This action is not allowed.') {
    super(message, 403);
  }
}

export class NotFoundGameError extends GameError {
  constructor(message = 'Room was not found.') {
    super(message, 404);
  }
}
```

- [ ] **Step 4: state 구현**

Use snippet from section 2.3.

- [ ] **Step 5: 테스트 통과 확인**

Run:

```bash
pnpm test src/features/game/domain/scoring.test.ts
```

Expected:

- 모든 scoring test가 통과한다.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain
git commit -m "feat: add authoritative game domain"
```

### Task 4: input schema와 API validation 도입

**Files:**

- Create: `src/features/game/server/api-schemas.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/api/check-room/route.ts`
- Modify: `src/app/api/ready/route.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/game/roll-dice/route.ts`
- Modify: `src/app/api/game/hold-dice/route.ts`
- Modify: `src/app/api/game/select-score/route.ts`

- [ ] **Step 1: schemas 파일 생성**

Use snippet from section 2.4.

- [ ] **Step 2: route parsing pattern 적용**

모든 route에서 직접 `await req.json()` destructuring을 제거하고 schema parse를 사용한다.

Example for `src/app/api/game/roll-dice/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { rollDiceInputSchema } from '@/features/game/server/api-schemas';
import { rollCurrentTurnDice } from '@/features/game/server/room-service';
import { GameError } from '@/features/game/domain/errors';

export async function POST(req: Request) {
  try {
    const input = rollDiceInputSchema.parse(await req.json());
    return NextResponse.json(rollCurrentTurnDice(input));
  } catch (error) {
    if (error instanceof GameError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
```

- [ ] **Step 3: select-score 요청 형태 변경**

Old request body:

```json
{
  "roomId": "room1",
  "nick": "solji",
  "scores": { "Ones": 3 },
  "lastSelected": "Ones"
}
```

New request body:

```json
{
  "roomId": "room1",
  "nick": "solji",
  "category": "Ones"
}
```

- [ ] **Step 4: 검증**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected:

- 아직 service가 없어서 일부 route가 실패할 수 있다. 이 task는 schema contract 정렬이 목적이다.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/server/api-schemas.ts src/app/api src/app/page.tsx
git commit -m "refactor: validate api inputs with zod"
```

### Task 5: room store와 SSE bus 분리

**Files:**

- Create: `src/features/game/server/room-store.ts`
- Create: `src/features/game/server/sse-bus.ts`
- Create: `src/features/game/shared/messages.ts`
- Modify: `src/lib/roomBus.ts`

- [ ] **Step 1: shared message 타입 생성**

Create `src/features/game/shared/messages.ts`:

```ts
import { Die, GameResult, RoomPhase } from '../domain/state';
import { ScoreSheet } from '../domain/categories';

export type UserView = {
  nick: string;
  ready: boolean;
  connected: boolean;
};

export type GameSnapshot = {
  roomId: string;
  phase: RoomPhase;
  users: UserView[];
  countdown: number | null;
  turnNick: string | null;
  scores: Record<string, ScoreSheet>;
  dice: Die[];
  rollsLeft: number;
  result: GameResult | null;
};

export type ServerMessage =
  | { type: 'system'; id: string; text: string; at: number }
  | { type: 'chat'; id: string; nick: string; text: string; at: number }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'force-exit'; reason: string };
```

- [ ] **Step 2: room-store 생성**

Create `src/features/game/server/room-store.ts`:

```ts
import { createEmptyScoreSheet } from '../domain/categories';
import { Connection, Player, RoomEvent, RoomState, createInitialDice } from '../domain/state';

type GlobalRooms = {
  rooms?: Map<string, RoomState>;
  connections?: Map<string, Map<string, Connection>>;
};

const globalRooms = globalThis as typeof globalThis & GlobalRooms;

if (!globalRooms.rooms) globalRooms.rooms = new Map<string, RoomState>();
if (!globalRooms.connections) globalRooms.connections = new Map<string, Map<string, Connection>>();

export const rooms = globalRooms.rooms;
export const connections = globalRooms.connections;

export function createRoom(roomId: string): RoomState {
  return {
    roomId,
    phase: 'lobby',
    players: new Map<string, Player>(),
    turnOrder: [],
    turnIndex: 0,
    dice: createInitialDice(),
    rollsLeft: 3,
    countdown: null,
    countdownTimer: null,
    result: null,
    events: [],
  };
}

export function getOrCreateRoom(roomId: string) {
  let room = rooms.get(roomId);
  if (!room) {
    room = createRoom(roomId);
    rooms.set(roomId, room);
  }
  return room;
}

export function peekRoom(roomId: string) {
  return rooms.get(roomId) ?? null;
}

export function addPlayer(room: RoomState, nick: string) {
  const existing = room.players.get(nick);
  if (existing) {
    existing.connected = true;
    existing.disconnectedAt = null;
    return existing;
  }

  const player: Player = {
    nick,
    ready: false,
    connected: true,
    joinedAt: Date.now(),
    disconnectedAt: null,
    scoreSheet: createEmptyScoreSheet(),
  };

  room.players.set(nick, player);
  room.turnOrder.push(nick);
  return player;
}

export function appendEvent(room: RoomState, event: Omit<RoomEvent, 'id' | 'roomId' | 'at'>) {
  const roomEvent: RoomEvent = {
    ...event,
    id: crypto.randomUUID(),
    roomId: room.roomId,
    at: Date.now(),
  };
  room.events.push(roomEvent);
  room.events = room.events.slice(-500);
  return roomEvent;
}
```

- [ ] **Step 3: sse-bus 생성**

Create `src/features/game/server/sse-bus.ts`:

```ts
import { Connection } from '../domain/state';
import { ServerMessage } from '../shared/messages';
import { connections } from './room-store';

const encoder = new TextEncoder();

export function addConnection(roomId: string, connection: Connection) {
  const roomConnections = connections.get(roomId) ?? new Map<string, Connection>();
  const previous = roomConnections.get(connection.nick);

  if (previous) {
    sendToConnection(previous, {
      type: 'force-exit',
      reason: '다른 탭에서 접속하여 연결이 종료되었습니다.',
    });
    try {
      previous.controller.close();
    } catch {}
  }

  roomConnections.set(connection.nick, connection);
  connections.set(roomId, roomConnections);
}

export function removeConnection(roomId: string, nick: string) {
  const roomConnections = connections.get(roomId);
  roomConnections?.delete(nick);
  if (roomConnections?.size === 0) connections.delete(roomId);
}

export function sendToConnection(connection: Connection, message: ServerMessage) {
  connection.controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
}

export function broadcast(roomId: string, message: ServerMessage) {
  const roomConnections = connections.get(roomId);
  if (!roomConnections) return;

  for (const connection of roomConnections.values()) {
    try {
      sendToConnection(connection, message);
    } catch {
      roomConnections.delete(connection.nick);
    }
  }
}
```

- [ ] **Step 4: 기존 roomBus compatibility 제거 계획**

`src/lib/roomBus.ts`는 최종 삭제 대상으로 둔다. 이 task에서는 import 전환이 끝날 때까지 다음 re-export만 남긴다.

```ts
export type { ServerMessage } from '@/features/game/shared/messages';
export type { Die as TDice } from '@/features/game/domain/state';
export type { ScoreSheet as TScores } from '@/features/game/domain/categories';
```

- [ ] **Step 5: Commit**

```bash
git add src/features/game/server src/features/game/shared src/lib/roomBus.ts
git commit -m "refactor: split room store and sse bus"
```

### Task 6: 서버 권위 room-service 구현

**Files:**

- Create: `src/features/game/server/room-service.ts`
- Test: `src/features/game/server/room-service.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/features/game/server/room-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRoom } from './room-store';
import { applyScoreSelection, buildSnapshot, joinRoomState, setReadyState } from './room-service';

describe('room-service', () => {
  it('rejects score selection from non-turn player', () => {
    const room = createRoom('r1');
    joinRoomState(room, 'a');
    joinRoomState(room, 'b');
    room.phase = 'playing';
    room.turnOrder = ['a', 'b'];
    room.turnIndex = 0;
    room.dice = [
      { value: 1, held: false },
      { value: 1, held: false },
      { value: 1, held: false },
      { value: 2, held: false },
      { value: 3, held: false },
    ];
    room.rollsLeft = 2;

    expect(() => applyScoreSelection(room, { nick: 'b', category: 'Ones' })).toThrow(
      'Not your turn'
    );
  });

  it('scores only the selected category and advances the turn', () => {
    const room = createRoom('r1');
    joinRoomState(room, 'a');
    joinRoomState(room, 'b');
    room.phase = 'playing';
    room.turnOrder = ['a', 'b'];
    room.turnIndex = 0;
    room.dice = [
      { value: 1, held: false },
      { value: 1, held: false },
      { value: 1, held: false },
      { value: 2, held: false },
      { value: 3, held: false },
    ];
    room.rollsLeft = 2;

    applyScoreSelection(room, { nick: 'a', category: 'Ones' });

    expect(room.players.get('a')?.scoreSheet.Ones).toBe(3);
    expect(buildSnapshot(room).turnNick).toBe('b');
  });

  it('starts countdown only with at least two ready players', () => {
    const room = createRoom('r1');
    joinRoomState(room, 'a');
    joinRoomState(room, 'b');
    setReadyState(room, 'a', true);
    expect(room.phase).toBe('lobby');
    setReadyState(room, 'b', true);
    expect(room.phase).toBe('countdown');
  });
});
```

- [ ] **Step 2: room-service 구현**

Create `src/features/game/server/room-service.ts`:

```ts
import { SCORE_CATEGORIES, ScoreCategory } from '../domain/categories';
import { rollDice, assertRolledDice, resetDice } from '../domain/dice';
import { ForbiddenGameActionError, GameError, NotFoundGameError } from '../domain/errors';
import {
  calculateBonus,
  calculateScore,
  calculateTotal,
  isScoreSheetComplete,
} from '../domain/scoring';
import { RoomState } from '../domain/state';
import { GameSnapshot } from '../shared/messages';
import { appendEvent, addPlayer, getOrCreateRoom, peekRoom, rooms } from './room-store';
import { broadcast } from './sse-bus';

export function getTurnNick(room: RoomState) {
  return room.turnOrder[room.turnIndex] ?? null;
}

export function buildSnapshot(room: RoomState): GameSnapshot {
  const scores = Object.fromEntries(
    [...room.players.values()].map(player => [player.nick, player.scoreSheet])
  );

  return {
    roomId: room.roomId,
    phase: room.phase,
    users: [...room.players.values()].map(player => ({
      nick: player.nick,
      ready: player.ready,
      connected: player.connected,
    })),
    countdown: room.countdown,
    turnNick: getTurnNick(room),
    scores,
    dice: room.dice,
    rollsLeft: room.rollsLeft,
    result: room.result,
  };
}

export function getRoomSnapshot(roomId: string) {
  const room = peekRoom(roomId);
  if (!room) throw new NotFoundGameError();
  return { ...buildSnapshot(room), events: room.events };
}

export function broadcastSnapshot(room: RoomState) {
  broadcast(room.roomId, { type: 'snapshot', snapshot: buildSnapshot(room) });
}

export function joinRoomState(room: RoomState, nick: string) {
  if (room.phase === 'playing' || room.phase === 'finished') {
    throw new ForbiddenGameActionError('이미 시작된 방에는 입장할 수 없습니다.');
  }

  addPlayer(room, nick);
  appendEvent(room, { type: 'system', text: `${nick}님이 입장했습니다.` });
}

export function joinRoom(roomId: string, nick: string) {
  const room = getOrCreateRoom(roomId);
  joinRoomState(room, nick);
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function setReadyState(room: RoomState, nick: string, ready: boolean) {
  if (room.phase !== 'lobby' && room.phase !== 'countdown') {
    throw new GameError('게임 중에는 준비 상태를 바꿀 수 없습니다.');
  }

  const player = room.players.get(nick);
  if (!player) throw new NotFoundGameError('플레이어가 방에 없습니다.');

  player.ready = ready;
  const players = [...room.players.values()];
  const allReady = players.length >= 2 && players.every(p => p.ready);

  if (allReady) {
    room.phase = 'countdown';
    room.countdown = 3;
  } else if (room.phase === 'countdown') {
    cancelCountdown(room);
  }
}

export function setReady(roomId: string, nick: string, ready: boolean) {
  const room = getOrCreateRoom(roomId);
  setReadyState(room, nick, ready);
  broadcastSnapshot(room);
}

export function cancelCountdown(room: RoomState) {
  if (room.countdownTimer) clearInterval(room.countdownTimer);
  room.countdownTimer = null;
  room.countdown = null;
  room.phase = 'lobby';
}

export function startGame(room: RoomState) {
  const players = [...room.players.values()];
  if (players.length < 2) throw new GameError('게임을 시작하려면 2명 이상 필요합니다.');
  if (!players.every(player => player.ready))
    throw new GameError('모든 플레이어가 준비되어야 합니다.');

  room.phase = 'playing';
  room.countdown = null;
  room.countdownTimer = null;
  room.turnOrder = players.map(player => player.nick);
  room.turnIndex = 0;
  room.dice = resetDice();
  room.rollsLeft = 3;
}

export function rollCurrentTurnDice(input: { roomId: string; nick: string }) {
  const room = getOrCreateRoom(input.roomId);
  assertPlayingTurn(room, input.nick);
  if (room.rollsLeft <= 0) throw new GameError('더 이상 굴릴 수 없습니다.');

  room.dice = rollDice(room.dice);
  room.rollsLeft -= 1;
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function toggleHeldDie(input: { roomId: string; nick: string; index: number }) {
  const room = getOrCreateRoom(input.roomId);
  assertPlayingTurn(room, input.nick);
  if (room.rollsLeft === 3) throw new GameError('첫 굴림 전에는 주사위를 고정할 수 없습니다.');

  const die = room.dice[input.index];
  if (!die || die.value === null) throw new GameError('굴린 주사위만 고정할 수 있습니다.');

  die.held = !die.held;
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function applyScoreSelection(
  room: RoomState,
  input: { nick: string; category: ScoreCategory }
) {
  assertPlayingTurn(room, input.nick);
  if (room.rollsLeft === 3) throw new GameError('점수를 선택하기 전에 한 번 이상 굴려야 합니다.');

  const player = room.players.get(input.nick);
  if (!player) throw new NotFoundGameError('플레이어가 방에 없습니다.');
  if (player.scoreSheet[input.category] !== null) {
    throw new GameError('이미 선택한 점수 항목입니다.');
  }

  const rolledDice = assertRolledDice(room.dice);
  player.scoreSheet[input.category] = calculateScore(input.category, rolledDice);
  player.scoreSheet.Bonus = calculateBonus(player.scoreSheet);

  appendEvent(room, {
    type: 'system',
    text: `${input.nick}님이 ${input.category}를 선택했습니다.`,
  });

  advanceAfterScore(room);
}

export function selectScore(input: { roomId: string; nick: string; category: ScoreCategory }) {
  const room = getOrCreateRoom(input.roomId);
  applyScoreSelection(room, input);
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

function advanceAfterScore(room: RoomState) {
  if ([...room.players.values()].every(player => isScoreSheetComplete(player.scoreSheet))) {
    const totals = Object.fromEntries(
      [...room.players.values()].map(player => [player.nick, calculateTotal(player.scoreSheet)])
    );
    const max = Math.max(...Object.values(totals));
    const winners = Object.entries(totals)
      .filter(([, total]) => total === max)
      .map(([nick]) => nick);

    room.phase = 'finished';
    room.result = { totals, winners, finishedAt: Date.now() };
    return;
  }

  do {
    room.turnIndex = (room.turnIndex + 1) % room.turnOrder.length;
  } while (isCurrentPlayerComplete(room));

  room.dice = resetDice();
  room.rollsLeft = 3;
}

function isCurrentPlayerComplete(room: RoomState) {
  const nick = getTurnNick(room);
  const player = nick ? room.players.get(nick) : null;
  return player ? SCORE_CATEGORIES.every(category => player.scoreSheet[category] !== null) : true;
}

function assertPlayingTurn(room: RoomState, nick: string) {
  if (room.phase !== 'playing') throw new GameError('게임 중에만 사용할 수 있습니다.');
  if (getTurnNick(room) !== nick) throw new ForbiddenGameActionError('Not your turn');
}

export function removeRoomIfEmpty(roomId: string) {
  const room = peekRoom(roomId);
  if (!room) return;
  if ([...room.players.values()].every(player => !player.connected)) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    rooms.delete(roomId);
  }
}
```

- [ ] **Step 3: 테스트 통과 확인**

Run:

```bash
pnpm test src/features/game/server/room-service.test.ts
```

Expected:

- room-service test 통과.

- [ ] **Step 4: Commit**

```bash
git add src/features/game/server/room-service.ts src/features/game/server/room-service.test.ts
git commit -m "feat: add authoritative room service"
```

### Task 7: API route를 room-service로 전환

**Files:**

- Modify: `src/app/api/check-room/route.ts`
- Modify: `src/app/api/ready/route.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/game/roll-dice/route.ts`
- Modify: `src/app/api/game/hold-dice/route.ts`
- Modify: `src/app/api/game/select-score/route.ts`
- Modify: `src/app/api/game/exit/route.ts`

- [ ] **Step 1: 공통 error response helper 생성**

Create `src/features/game/server/api-response.ts`:

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { GameError } from '../domain/errors';

export function jsonError(error: unknown) {
  if (error instanceof GameError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
```

- [ ] **Step 2: select-score route 변경**

Modify `src/app/api/game/select-score/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { selectScoreInputSchema } from '@/features/game/server/api-schemas';
import { selectScore } from '@/features/game/server/room-service';

export async function POST(req: Request) {
  try {
    const input = selectScoreInputSchema.parse(await req.json());
    return NextResponse.json(selectScore(input));
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 3: roll/hold/ready/check/chat/exit route도 같은 패턴 적용**

Example `src/app/api/game/hold-dice/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { holdDiceInputSchema } from '@/features/game/server/api-schemas';
import { toggleHeldDie } from '@/features/game/server/room-service';

export async function POST(req: Request) {
  try {
    const input = holdDiceInputSchema.parse(await req.json());
    return NextResponse.json(toggleHeldDie(input));
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 4: 검증**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected:

- API type errors가 없어야 한다.

- [ ] **Step 5: Commit**

```bash
git add src/app/api src/features/game/server/api-response.ts
git commit -m "refactor: route game api through room service"
```

### Task 8: SSE route를 snapshot 중심으로 재작성

**Files:**

- Modify: `src/app/api/sse/route.ts`
- Modify: `src/providers/room-provider.tsx`

- [ ] **Step 1: SSE route 변경**

`src/app/api/sse/route.ts`:

```ts
import { joinRoomInputSchema } from '@/features/game/server/api-schemas';
import { jsonError } from '@/features/game/server/api-response';
import { addConnection, removeConnection, sendToConnection } from '@/features/game/server/sse-bus';
import { buildSnapshot, joinRoom, removeRoomIfEmpty } from '@/features/game/server/room-service';
import { getOrCreateRoom } from '@/features/game/server/room-store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const input = joinRoomInputSchema.parse({
      roomId: searchParams.get('room'),
      nick: searchParams.get('nick'),
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const connection = {
          id: crypto.randomUUID(),
          nick: input.nick,
          controller,
        };

        addConnection(input.roomId, connection);
        const snapshot = joinRoom(input.roomId, input.nick);
        sendToConnection(connection, { type: 'snapshot', snapshot });

        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          } catch {}
        }, 15000);

        const close = () => {
          clearInterval(heartbeat);
          removeConnection(input.roomId, input.nick);
          const room = getOrCreateRoom(input.roomId);
          const player = room.players.get(input.nick);
          if (player) {
            player.connected = false;
            player.disconnectedAt = Date.now();
          }
          removeRoomIfEmpty(input.roomId);
        };

        req.signal.addEventListener('abort', close, { once: true });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 2: RoomProvider message handling 단순화**

`RoomProvider`는 `game/state`, `update-turn`, `update-scores` 등 이벤트별 상태 조합을 제거하고 `snapshot` 하나만 state에 반영한다.

핵심 reducer:

```ts
if (data.type === 'snapshot') {
  setUsers(data.snapshot.users);
  setGameStarted(data.snapshot.phase === 'playing' || data.snapshot.phase === 'finished');
  setCountdown(data.snapshot.countdown);
  setScores(data.snapshot.scores);
  setTurnNick(data.snapshot.turnNick);
  setDice(data.snapshot.dice);
  setRollsLeft(data.snapshot.rollsLeft);
  setResult(data.snapshot.result);
}
```

- [ ] **Step 3: 검증**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected:

- `ServerMessage` 타입과 Provider 상태 타입이 일치해야 한다.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sse/route.ts src/providers/room-provider.tsx
git commit -m "refactor: sync room state with snapshots"
```

### Task 9: ScoreTable을 표시 전용 + category 선택으로 변경

**Files:**

- Modify: `src/components/ScoreTable.tsx`
- Modify: `src/components/GameBoard.tsx`

- [ ] **Step 1: ScoreTable props 변경**

Old:

```ts
onUpdate: (newScores: TScores, category: string) => void;
```

New:

```ts
onSelectCategory: (category: ScoreCategory) => void;
```

- [ ] **Step 2: ScoreTable에서 점수 계산과 Bonus effect 제거**

`ScoreTable`은 다음만 한다.

- 현재 scoreSheet 렌더링
- 서버 snapshot의 dice를 기준으로 예상 점수 표시
- 선택 가능한 row 클릭 시 category만 전송
- Bonus는 `scores.Bonus`만 표시

핵심 스니펫:

```tsx
<Button
  type="button"
  variant="ghost"
  disabled={isRowDisabled(category)}
  onClick={() => onSelectCategory(category)}
>
  {scores[category] === null ? predicted[category] : scores[category]}
</Button>
```

- [ ] **Step 3: GameBoard select-score 요청 변경**

Modify `GameBoard`:

```ts
const handleSelectCategory = async (category: ScoreCategory) => {
  const res = await fetch('/api/game/select-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, nick, category }),
  });

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    toast.error(data.error ?? '점수 선택에 실패했습니다.');
  }
};
```

- [ ] **Step 4: `rollsLeft` unused 제거**

`GameBoard`에서 쓰지 않는 `rollsLeft` destructuring을 제거한다.

- [ ] **Step 5: 검증**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected:

- `ScoreTable`의 hook dependency 경고가 사라진다.
- 보너스 자동 턴 넘김 경로가 사라진다.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScoreTable.tsx src/components/GameBoard.tsx
git commit -m "refactor: make scoring server authoritative"
```

### Task 10: 주사위 UI 안정화

**Files:**

- Modify: `src/components/Dice3D.tsx`
- Modify: `src/components/DiceOverlay.tsx`
- Modify: `src/types/dice-box-threejs.d.ts`

- [ ] **Step 1: DiceOverlay any 제거**

```ts
import { useEffect } from 'react';
import { DiceEventData } from '@drdreo/dice-box-threejs';

type DiceHoverEvent = CustomEvent<DiceEventData | null>;

export function DiceHoverOverlay() {
  useEffect(() => {
    const handler = (event: Event) => {
      const diceInfo = (event as DiceHoverEvent).detail;
      // existing overlay logic
    };

    document.addEventListener('diceHover', handler);
    return () => document.removeEventListener('diceHover', handler);
  }, []);

  return null;
}
```

- [ ] **Step 2: DiceBox type any 제거**

Modify `src/types/dice-box-threejs.d.ts`:

```ts
theme_customColorset?: unknown;
constructor(element_container: string | HTMLElement, options?: Partial<DiceConfig>);
```

- [ ] **Step 3: Dice3D fetch error 처리**

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

- [ ] **Step 4: `toggleHold`를 `useCallback`으로 감싸 hook 경고 제거**

```ts
const toggleHold = useCallback(
  async (index: number) => {
    try {
      await postJson('/api/game/hold-dice', { roomId, nick, index });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '주사위 고정/해제 실패');
    }
  },
  [roomId, nick]
);
```

- [ ] **Step 5: 검증**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected:

- `Dice3D`, `DiceOverlay`, `dice-box-threejs.d.ts`의 lint 에러/경고가 사라진다.

- [ ] **Step 6: Commit**

```bash
git add src/components/Dice3D.tsx src/components/DiceOverlay.tsx src/types/dice-box-threejs.d.ts
git commit -m "fix: stabilize dice interactions"
```

### Task 11: input 기반 pagination 추가

**Files:**

- Create: `src/features/game/shared/pagination.ts`
- Create: `src/features/game/shared/pagination.test.ts`
- Create: `src/app/api/chat/history/route.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/components/ChatRoom.tsx`

- [ ] **Step 1: pagination 실패 테스트 작성**

Create `src/features/game/shared/pagination.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodeCursor, pageByInput } from './pagination';

const events = Array.from({ length: 5 }, (_, index) => ({
  id: `e${index + 1}`,
  at: 1000 + index,
  text: `message ${index + 1}`,
}));

describe('input-based cursor pagination', () => {
  it('returns the first page without offset', () => {
    const page = pageByInput(events, { limit: 2 });
    expect(page.nodes.map(event => event.id)).toEqual(['e5', 'e4']);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(page.pageInfo.endCursor).toBeTruthy();
  });

  it('uses before cursor for older records', () => {
    const cursor = encodeCursor(events[3]);
    const page = pageByInput(events, { limit: 2, before: cursor });
    expect(page.nodes.map(event => event.id)).toEqual(['e3', 'e2']);
  });
});
```

- [ ] **Step 2: pagination 구현**

Use snippet from section 2.5.

- [ ] **Step 3: chat route가 event를 저장하도록 변경**

`src/app/api/chat/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { jsonError } from '@/features/game/server/api-response';
import { sendChatInputSchema } from '@/features/game/server/api-schemas';
import { appendEvent, getOrCreateRoom } from '@/features/game/server/room-store';
import { broadcast } from '@/features/game/server/sse-bus';

export async function POST(req: Request) {
  try {
    const input = sendChatInputSchema.parse(await req.json());
    const room = getOrCreateRoom(input.roomId);

    if (!room.players.has(input.nick)) {
      return NextResponse.json({ error: '플레이어가 방에 없습니다.' }, { status: 403 });
    }

    const event = appendEvent(room, {
      type: 'chat',
      nick: input.nick,
      text: input.text,
    });

    broadcast(input.roomId, {
      type: 'chat',
      id: event.id,
      nick: input.nick,
      text: input.text,
      at: event.at,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 4: history route 추가**

Use snippet from section 2.5.

- [ ] **Step 5: ChatRoom에서 이전 메시지 불러오기**

`ChatRoom` 상단에 "이전 메시지" 버튼을 두고 `before` cursor로 이전 히스토리를 불러온다.

```ts
const [historyCursor, setHistoryCursor] = React.useState<string | null>(null);
const [historyMessages, setHistoryMessages] = React.useState<RoomContextType['messages']>([]);

const loadOlderMessages = async () => {
  const res = await fetch('/api/chat/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId,
      pagination: {
        limit: 30,
        before: historyCursor ?? undefined,
      },
    }),
  });

  const page = (await res.json()) as {
    nodes: RoomContextType['messages'];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };

  setHistoryMessages(current => [...page.nodes, ...current]);
  setHistoryCursor(page.pageInfo.endCursor);
};
```

렌더링은 `historyMessages`와 `messages`를 합쳐서 사용한다.

```ts
const visibleMessages = React.useMemo(
  () => [...historyMessages, ...messages],
  [historyMessages, messages]
);
```

- [ ] **Step 6: 검증**

Run:

```bash
pnpm test src/features/game/shared/pagination.test.ts
pnpm typecheck
```

Expected:

- offset/page 번호 없이 cursor input만으로 과거 메시지를 조회할 수 있다.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/shared/pagination.ts src/features/game/shared/pagination.test.ts src/app/api/chat src/components/ChatRoom.tsx
git commit -m "feat: add input cursor pagination for chat history"
```

### Task 12: 게임 종료/결과 UI 추가

**Files:**

- Modify: `src/providers/room-provider.tsx`
- Modify: `src/components/GameBoard.tsx`
- Create: `src/components/GameResult.tsx`
- Create: `src/app/api/game/restart/route.ts`

- [ ] **Step 1: RoomProvider에 result/phase 추가**

```ts
export type RoomContextType = {
  roomId: string;
  nick: string;
  connected: boolean;
  messages: Message[];
  users: UserView[];
  phase: RoomPhase;
  gameStarted: boolean;
  countdown: number | null;
  scores: Record<string, ScoreSheet>;
  turnNick: string | null;
  dice: Die[];
  rollsLeft: number;
  result: GameResult | null;
};
```

- [ ] **Step 2: GameResult 컴포넌트 생성**

Create `src/components/GameResult.tsx`:

```tsx
'use client';

import { Trophy } from 'lucide-react';
import { GameResult as GameResultType } from '@/features/game/domain/state';
import { Button } from './ui/button';

export function GameResult({
  result,
  onRestart,
}: {
  result: GameResultType;
  onRestart: () => void;
}) {
  const rows = Object.entries(result.totals).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-xl font-semibold">
        <Trophy className="size-5" />
        게임 결과
      </div>
      <div className="rounded-md border">
        {rows.map(([nick, total]) => (
          <div
            key={nick}
            className="flex items-center justify-between border-b px-3 py-2 last:border-b-0"
          >
            <span className="font-medium">
              {result.winners.includes(nick) ? '🏆 ' : ''}
              {nick}
            </span>
            <span>{total}</span>
          </div>
        ))}
      </div>
      <Button onClick={onRestart}>다시 시작</Button>
    </section>
  );
}
```

- [ ] **Step 3: restart API 구현**

Restart는 같은 player 목록을 유지하고 모든 점수/ready를 초기화한다.

```ts
export async function POST(req: Request) {
  try {
    const input = joinRoomInputSchema.parse(await req.json());
    return NextResponse.json(restartRoom(input.roomId, input.nick));
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 4: 검증**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected:

- 모든 카테고리 완료 후 `phase === "finished"`이고 결과 UI가 표시된다.

- [ ] **Step 5: Commit**

```bash
git add src/providers/room-provider.tsx src/components/GameBoard.tsx src/components/GameResult.tsx src/app/api/game/restart/route.ts
git commit -m "feat: add game results and restart"
```

### Task 13: 로비/준비/퇴장 상태 안정화

**Files:**

- Modify: `src/features/game/server/room-service.ts`
- Modify: `src/components/PlayerList.tsx`
- Modify: `src/app/api/game/exit/route.ts`

- [ ] **Step 1: countdown interval을 service에서만 관리**

`setReady`가 countdown phase만 설정하는 현재 Task 6 스니펫을 확장해서 실제 timer를 시작한다.

```ts
export function maybeStartCountdown(room: RoomState) {
  if (room.phase !== 'countdown' || room.countdownTimer) return;

  room.countdownTimer = setInterval(() => {
    const players = [...room.players.values()];
    if (players.length < 2 || !players.every(player => player.ready && player.connected)) {
      cancelCountdown(room);
      broadcastSnapshot(room);
      return;
    }

    if (room.countdown && room.countdown > 1) {
      room.countdown -= 1;
      broadcastSnapshot(room);
      return;
    }

    if (room.countdownTimer) clearInterval(room.countdownTimer);
    startGame(room);
    broadcastSnapshot(room);
  }, 1000);
}
```

- [ ] **Step 2: 현재 턴 퇴장 처리 수정**

현재 플레이어가 나가면 남은 플레이어 중 건너뛰기 없이 다음 턴을 정한다.

```ts
export function markDisconnected(roomId: string, nick: string) {
  const room = getOrCreateRoom(roomId);
  const player = room.players.get(nick);
  if (!player) return buildSnapshot(room);

  player.connected = false;
  player.disconnectedAt = Date.now();

  if (room.phase === 'countdown') {
    cancelCountdown(room);
  }

  const connectedPlayers = [...room.players.values()].filter(p => p.connected);
  if (room.phase === 'playing' && connectedPlayers.length < 2) {
    room.phase = 'finished';
    room.result = {
      totals: Object.fromEntries(
        [...room.players.values()].map(p => [p.nick, calculateTotal(p.scoreSheet)])
      ),
      winners: connectedPlayers.map(p => p.nick),
      finishedAt: Date.now(),
    };
  }

  if (getTurnNick(room) === nick && room.phase === 'playing') {
    while (!room.players.get(getTurnNick(room) ?? '')?.connected) {
      room.turnIndex = (room.turnIndex + 1) % room.turnOrder.length;
    }
    room.dice = resetDice();
    room.rollsLeft = 3;
  }

  broadcastSnapshot(room);
  return buildSnapshot(room);
}
```

- [ ] **Step 3: PlayerList 버튼 문구 수정**

게임 중에는 disabled 버튼에 `"게임 중"` 표시, 준비 완료 상태는 `"준비 완료"` 표시.

- [ ] **Step 4: 검증**

Run:

```bash
pnpm test src/features/game/server/room-service.test.ts
pnpm lint
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/features/game/server/room-service.ts src/components/PlayerList.tsx src/app/api/game/exit/route.ts
git commit -m "fix: stabilize lobby countdown and disconnect flow"
```

### Task 14: 레이아웃/UX 정리

**Files:**

- Modify: `src/app/[roomId]/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/GameBoard.tsx`
- Modify: `src/components/ScoreTable.tsx`
- Modify: `src/components/ChatRoom.tsx`

- [ ] **Step 1: Yahtzee 표기 통일**

`Yathzee`를 `Yahtzee`로 변경한다.

- [ ] **Step 2: 모바일 레이아웃 적용**

Modify `src/app/[roomId]/page.tsx` main class:

```tsx
<main className="grid h-full grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)] lg:gap-6 lg:p-8">
```

- [ ] **Step 3: dice board responsive CSS**

Modify `src/app/globals.css`:

```css
.dice-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(400px, calc(100vw - 2rem));
  aspect-ratio: 1;
  background: url(/images/dice_board.png) center / contain no-repeat;
  border-radius: clamp(24px, 10vw, 70px);
  overflow: hidden;
}

#dice-box {
  position: relative;
  width: 72%;
  height: 68%;
  margin-top: 5%;
}
```

- [ ] **Step 4: ScoreTable에 예상 점수 표시**

미채점 row는 선택 버튼에 예상 점수와 카테고리명을 함께 표시한다.

- [ ] **Step 5: 검증**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Then run local server:

```bash
pnpm dev
```

Manual checks:

- Desktop 1440px에서 게임판/채팅/참가자가 겹치지 않는다.
- Mobile 390px에서 단일 컬럼으로 내려온다.
- 점수표 버튼 텍스트가 넘치지 않는다.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "refactor: improve responsive game layout"
```

### Task 15: 최종 lint/build/test 안정화

**Files:**

- Modify: files reported by `pnpm lint`, `pnpm typecheck`, or `rg "roomBus|TScores|TDice|TUsers" src` after Tasks 1-14
- Delete: `src/lib/roomBus.ts` when all imports are migrated

- [ ] **Step 1: 남은 roomBus import 제거**

Run:

```bash
rg "roomBus|TScores|TDice|TUsers" src
```

Expected:

- compatibility re-export가 필요 없으면 `src/lib/roomBus.ts` 삭제.
- 남은 import는 새 domain/shared 타입으로 전환.

- [ ] **Step 2: lint 경고 0 만들기**

Run:

```bash
pnpm lint
```

Expected:

- 0 errors, 0 warnings.

- [ ] **Step 3: typecheck**

Run:

```bash
pnpm typecheck
```

Expected:

- exit code 0.

- [ ] **Step 4: unit tests**

Run:

```bash
pnpm test
```

Expected:

- scoring, room-service, pagination tests pass.

- [ ] **Step 5: production build**

Run:

```bash
pnpm build
```

Expected:

- Next/Turbopack production build passes.

- [ ] **Step 6: audit**

Run:

```bash
pnpm audit --audit-level=moderate
```

Expected:

- Next/React critical/high advisories are resolved.
- 남는 dev dependency 취약점이 있으면 package-specific upgrade task를 추가하고 이 step을 반복한다.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: complete yahtzee refactor verification"
```

## 4. 수동 QA 시나리오

리팩토링 완료 후 다음 시나리오를 직접 검증한다.

1. 두 브라우저에서 같은 room에 서로 다른 nick으로 입장한다.
2. 한 명만 ready일 때는 countdown이 시작되지 않는다.
3. 두 명 모두 ready면 countdown이 시작된다.
4. countdown 중 한 명이 ready 취소하면 countdown이 취소된다.
5. 게임 시작 후 비턴 플레이어가 roll/hold/select-score API를 호출하면 403이 반환된다.
6. 현재 턴 플레이어가 첫 roll 전에 hold/select-score를 시도하면 400이 반환된다.
7. 현재 턴 플레이어가 roll 후 category를 선택하면 서버 계산 점수만 저장된다.
8. upper total 63 이상이 되면 Bonus가 자동 반영되지만 턴 전환은 category 선택 1회에 대해서만 발생한다.
9. 모든 카테고리 완료 후 `finished` 결과 화면이 표시된다.
10. 채팅 history는 `before` cursor로 이전 메시지를 가져오고, offset/page query를 사용하지 않는다.
11. 게임 중 시작된 방에 새 nick으로 직접 URL 접근하면 입장이 거부된다.
12. 모바일 폭에서 게임판/채팅/참가자 UI가 겹치지 않는다.

## 5. 완료 기준

- `pnpm verify` 통과
- `pnpm audit --audit-level=moderate`에서 Next/React critical/high 취약점 해소
- 서버가 `scores` 전체를 받는 API 제거
- `select-score` request body가 `{ roomId, nick, category }`만 사용
- `Bonus`는 서버 파생 값이며 별도 턴 전환 이벤트가 아님
- `phase: "finished"`와 결과 UI 구현
- 시작된 방 입장 차단이 홈과 SSE 양쪽에 적용
- input 기반 cursor pagination 구현
- offset/page 기반 pagination parameter 없음
- `roomBus.ts` 제거 또는 compatibility shim만 남고 신규 코드가 직접 의존하지 않음
- `research.md`에서 지적한 major 위험 항목이 모두 대응됨

## 6. 실행 순서 요약

1. 보안 패치와 Next root 설정
2. 테스트 인프라
3. 도메인 점수/상태 모델
4. API input schema
5. room store/SSE bus 분리
6. 서버 권위 room-service
7. API route 전환
8. snapshot 기반 Provider 전환
9. ScoreTable 표시 전용화
10. Dice3D 안정화
11. input cursor pagination
12. 결과/재시작
13. 로비/퇴장 안정화
14. 반응형 UX
15. 최종 verify/audit

각 task는 독립 커밋으로 남긴다. 중간에 build가 실패하는 task가 있을 수 있지만, Task 15 완료 시점에는 lint/typecheck/test/build/audit 기준을 모두 통과해야 한다.
