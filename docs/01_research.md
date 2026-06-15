# Yahtzee Game Project Research

작성일: 2026-05-28

## 1. 조사 목적과 범위

이 문서는 `plan.md`를 작성하기 전에 현재 야추/야찌 게임 프로젝트가 실제로 어떻게 동작하는지 파악하기 위한 코드 리서치 보고서다. 구현 계획이 아니라, 현재 상태의 구조, 데이터 흐름, 구현 완료/미완료 지점, 규칙 불일치, 빌드 상태, 위험 요소를 기록한다.

조사한 주요 영역:

- Next.js 앱 라우팅 구조
- 인메모리 방/게임 상태 모델
- SSE 기반 실시간 동기화
- 입장, 준비, 게임 시작, 채팅, 퇴장 흐름
- 주사위 굴림/고정 흐름
- 점수표 계산/선택 흐름
- 정적 검사 및 빌드 상태

실행한 검증:

- `pnpm exec tsc --noEmit`: 통과
- `pnpm lint`: 실패
- `pnpm build`: 실패
  - 최초 샌드박스 내 실행은 Turbopack의 포트 바인딩 제한으로 실패
  - 제한 없이 재실행했을 때 컴파일은 성공했지만 ESLint 에러로 최종 실패

## 2. 기술 스택과 프로젝트 구성

이 프로젝트는 Next.js App Router 기반 클라이언트 중심 게임 앱이다.

핵심 스택:

- Next.js `15.5.2`
- React `19.1.0`
- TypeScript strict mode
- Tailwind CSS v4
- shadcn 스타일 UI 컴포넌트
- Radix UI
- Sonner toast
- `@drdreo/dice-box-threejs`를 통한 3D 주사위
- SSE(`EventSource`)를 이용한 서버->클라이언트 실시간 이벤트
- 서버 상태 저장은 DB 없이 `globalThis.__rooms__` 기반 인메모리 Map

주요 파일 맵:

- `src/app/page.tsx`: 닉네임/방 ID 입력 후 방 입장
- `src/app/[roomId]/page.tsx`: 방 화면 레이아웃, `RoomProvider` 장착
- `src/providers/room-provider.tsx`: SSE 연결과 클라이언트 게임 상태 저장
- `src/lib/roomBus.ts`: 방 상태, 유저 목록, 게임 상태, 점수, 주사위, 브로드캐스트 관리
- `src/components/GameBoard.tsx`: 게임 시작 전/후 화면, 주사위와 점수표 조합
- `src/components/Dice3D.tsx`: 3D 주사위 초기화, 굴림 애니메이션, 고정/해제 요청
- `src/components/ScoreTable.tsx`: 점수 계산, 점수 선택 UI, 보너스 자동 처리
- `src/components/ChatRoom.tsx`: 채팅 UI
- `src/components/PlayerList.tsx`: 참가자 목록과 준비 버튼
- `src/app/api/sse/route.ts`: SSE 스트림 연결
- `src/app/api/check-room/route.ts`: 입장 전 방 상태/닉네임 중복 확인
- `src/app/api/ready/route.ts`: 준비 상태 변경
- `src/app/api/chat/route.ts`: 채팅 브로드캐스트
- `src/app/api/game/roll-dice/route.ts`: 주사위 굴림
- `src/app/api/game/hold-dice/route.ts`: 주사위 고정/해제
- `src/app/api/game/select-score/route.ts`: 점수 저장 및 턴 전환
- `src/app/api/game/exit/route.ts`: 명시적 퇴장

## 3. 현재 데이터 모델

서버의 핵심 상태는 `src/lib/roomBus.ts`의 `RoomState`다.

```ts
type RoomState = {
  clients: Set<Client>;
  started: boolean;
  countdown: number | null;
  turnNick: string | null;
  scores: Record<string, TScores>;
  dice: TDice[];
  rollsLeft: number;
};
```

`Client`는 플레이어라기보다 현재 SSE 연결이다.

```ts
type Client = {
  id: string;
  nick: string;
  ready: boolean;
  controller: ReadableStreamDefaultController<Uint8Array>;
};
```

현재 설계에서 "플레이어 목록"은 별도 도메인 객체가 아니라 `clients` Set에서 파생된다. 따라서 연결 상태와 플레이어 상태가 강하게 결합되어 있다. 탭 닫힘, 재접속, 중복 접속, 네트워크 끊김이 곧 플레이어 상태 변경으로 처리된다.

주사위 모델:

```ts
type TDice = { value: number | null; held: boolean };
```

초기 주사위는 5개이며 모두 `{ value: null, held: false }`다. 턴이 바뀔 때도 같은 초기 상태로 리셋된다.

점수 모델:

```ts
type TScores = Record<string, number | null>;
```

신규 플레이어 점수판은 다음 키로 초기화된다.

- `Ones`
- `Twos`
- `Threes`
- `Fours`
- `Fives`
- `Sixes`
- `Bonus`
- `FourKind`
- `FullHouse`
- `SmallStraight`
- `LargeStraight`
- `Chance`
- `Yahtzee`

주의할 점:

- `Bonus`는 `null`이 아니라 `0`으로 시작한다.
- 점수 타입이 구체적인 union이 아니라 `Record<string, number | null>`라서 임의 키가 들어와도 타입 수준에서 막지 못한다.
- 전통적인 Yahtzee 기준으로는 `Three of a Kind`가 없다.
- 현재 UI는 `getTurnNumber`에서 상단 6개 + 하단 6개 총 12개 카테고리만 턴 수로 계산한다.

## 4. 입장 흐름

### 4.1 홈 화면

`src/app/page.tsx`는 클라이언트 컴포넌트다. Zod와 React Hook Form으로 닉네임과 방 ID를 검증한다.

검증 규칙:

- 닉네임: 1~10자
- 방 ID: 1~10자
- 방 ID 허용 문자: 영문, 숫자, 하이픈, 언더스코어

제출 시 `/api/check-room`에 `{ roomId, nick }`를 POST한다. 성공하면 닉네임만 `localStorage.chat_nick`에 저장하고 `/${room}`으로 이동한다.

현재 중요한 특성:

- 방 ID는 localStorage에 저장하지 않는다.
- 닉네임은 전역 `chat_nick` 하나만 사용하므로 방별 닉네임 개념이 없다.
- 입장 검증은 홈 화면 경유 시에만 실행된다.
- 사용자가 직접 `/${roomId}`로 접근하면 기존 `chat_nick`만 있으면 `/api/check-room` 없이 SSE에 연결된다.

### 4.2 방 상태 확인 API

`src/app/api/check-room/route.ts`는 다음을 검사한다.

- `roomId`와 `nick` 존재 여부
- `state.started === true`면 입장 거부
- 현재 `state.clients`에 같은 닉네임이 있으면 입장 거부

중요한 부작용:

- 이 API는 `getRoomState(roomId)`를 호출하므로, 단순 확인 요청만으로도 빈 방이 생성된다.
- 사용자가 확인만 하고 실제 SSE 연결을 하지 않으면 `clients.size === 0`인 방이 메모리에 남는다.
- 빈 방 정리 로직은 `removeClient`에서만 동작하므로, 확인만 하고 떠난 방은 정리되지 않는다.

## 5. 방 화면과 클라이언트 상태 흐름

`src/app/[roomId]/page.tsx`는 URL 파라미터에서 `roomId`를 얻고, `localStorage.chat_nick`에서 닉네임을 읽는다. 닉네임이 없으면 `/`로 되돌린다.

방 화면 레이아웃:

- 좌측 70%: `GameBoard`
- 우측 30%: `ChatRoom`, `PlayerList`, 나가기 버튼

반응형 관점:

- 메인 레이아웃은 항상 `grid-cols-[7fr_3fr]`다.
- 모바일용 단일 컬럼 전환이 없다.
- 주사위 컨테이너는 CSS에서 `400px x 400px` 고정이다.

`RoomProvider`는 다음 상태를 가진다.

- `connected`
- `messages`
- `users`
- `gameStarted`
- `countdown`
- `scores`
- `turnNick`
- `dice`
- `rollsLeft`

`RoomProvider`는 `/api/sse?room=...&nick=...`에 `EventSource`를 열고 서버 메시지를 처리한다.

처리하는 서버 메시지:

- `force-exit`: 토스트 표시 후 `/`로 이동
- `users`: 참가자 목록 갱신
- `game/state`: 시작 여부, 카운트다운, 턴, 점수, 주사위, 남은 굴림 수 갱신
- `game/start-countdown`: 카운트다운 숫자 갱신
- `game/start`: 게임 시작 상태로 전환
- `game/update-scores`: 점수 갱신 및 토스트
- `game/update-turn`: 턴, 주사위, 굴림 수, 유저 목록 갱신
- `system`/`chat`: 채팅 메시지 목록에 추가

주의할 점:

- `RoomProvider`의 SSE effect dependency에 `router`가 빠져 lint 경고가 난다.
- JSON parse 실패나 메시지 처리 오류를 모두 빈 `catch {}`로 삼킨다.
- `EventSource`의 기본 재연결 외에 앱 차원의 복구/재동기화 전략은 없다.
- `es.onerror`는 `connected=false`만 설정하고 상세 원인 처리는 없다.

## 6. SSE 서버 흐름

`src/app/api/sse/route.ts`는 Node.js runtime에서 `ReadableStream`을 만들고 각 클라이언트를 `roomBus.addClient`로 등록한다.

연결 시 순서:

1. `room`, `nick` query parameter 확인
2. `crypto.randomUUID()`로 연결 id 생성
3. `addClient(roomId, { id, nick, ready: false, controller })`
4. 입장 시스템 메시지 브로드캐스트
5. 현재 유저 목록을 현재 연결에 직접 전송
6. 현재 게임 상태 일부를 현재 연결에 직접 전송
7. 15초마다 `: ping` heartbeat 전송
8. request abort 시 `removeClient(roomId, nick, false)` 실행

중복 또는 비효율:

- `addClient` 내부에서도 `broadcastUsers`와 현재 연결 대상 `game/state` 전송을 한다.
- `sse/route.ts`에서도 다시 `users`와 일부 `game/state`를 직접 전송한다.
- 즉 신규 연결자는 유저 목록과 상태 메시지를 중복 수신할 수 있다.
- `sse/route.ts`에서 직접 보내는 `game/state`는 `started`와 `countdown`만 포함하고, `turnNick`, `scores`, `dice`, `rollsLeft`는 빠져 있다. 다만 `addClient`가 더 완전한 state를 보내므로 현재는 보완된다.

연결 종료 처리:

- request abort 시 소프트 퇴장으로 처리된다.
- 소프트 퇴장은 5초 대기 후에도 같은 닉네임이 없으면 턴 전환/유저 목록 갱신을 수행한다.
- `cancel()`에서는 별도 cleanup을 하지 않는다. 주석상 abort가 대부분 처리한다고 가정한다.

## 7. roomBus 동작 상세

### 7.1 방 생성과 전역 상태

`rooms`는 `globalThis.__rooms__`에 저장된다.

장점:

- 개발 중 HMR이나 일부 서버 재로드에서 상태가 유지될 수 있다.
- 별도 DB 없이 빠르게 멀티플레이 상태를 실험할 수 있다.

한계:

- 프로세스가 재시작되면 상태가 사라진다.
- 서버리스/멀티 인스턴스 배포에서는 방 상태가 인스턴스별로 갈라진다.
- 스케일아웃, 영속성, 관전/복구, 히스토리 저장에는 맞지 않는다.
- 방 정리 정책이 약하다.

### 7.2 addClient

`addClient`는 방이 없으면 생성한다. 같은 닉네임의 기존 연결이 있으면 기존 연결에 `force-exit`을 보내고 controller를 닫은 뒤 기존 client를 Set에서 삭제한다. 새 연결은 기존 ready 상태를 복사한다.

그 후 점수판이 없으면 초기 점수판을 만들고, 새 client를 추가하고, 유저 목록을 브로드캐스트하고, 새 연결에 현재 게임 상태를 직접 전송한다.

중요한 위험:

- 게임이 이미 시작된 방인지 검사하지 않는다.
- 따라서 홈의 `/api/check-room`을 우회하고 직접 `/${roomId}`에 접근하면 시작된 게임에도 들어올 수 있다.
- 중복 접속 처리에서 기존 controller를 닫을 때 기존 stream의 abort/close 처리와 새 연결 추가가 경합할 수 있다.
- 같은 닉네임 재접속은 Set 삽입 순서를 바꿀 수 있고, 이는 턴 순서에 영향을 줄 수 있다.

### 7.3 removeClient

명시적 나가기 버튼은 `/api/game/exit`을 호출하고 `removeClient(roomId, nick, true)`를 실행한다.

하드 퇴장:

- 즉시 client 삭제
- 방이 비면 방 삭제
- 게임 시작 후 1명만 남으면 `force-exit` 후 방 삭제
- 퇴장자가 현재 턴이면 `nextTurn`
- 유저 목록 브로드캐스트

소프트 퇴장:

- SSE abort에서 사용
- client 삭제 후 5초 기다림
- 5초 뒤에도 같은 닉네임이 없으면 필요 시 게임 종료/턴 전환/유저 목록 갱신

턴 전환 관련 버그 가능성:

- 현재 턴 플레이어가 나간 뒤 `nextTurn`이 호출되면, 이미 그 플레이어는 `clients`에서 삭제된 상태다.
- `nextTurn`은 `findIndex`가 `-1`이면 `currentIndex = 0`으로 놓고 `(currentIndex + 1) % clients.length`를 계산한다.
- 남은 플레이어가 2명 이상이면 첫 번째 남은 플레이어를 건너뛰고 두 번째 남은 플레이어가 턴을 받는다.

### 7.4 ready와 게임 시작

`setReady`는 해당 닉네임의 `Client.ready`를 바꾸고 유저 목록을 브로드캐스트한다.

게임 시작 조건:

- `room.clients.size >= 2`
- 모든 client의 `ready === true`
- `room.started === false`

조건이 맞으면 `startCountdown(roomId)`를 호출한다.

카운트다운 특성:

- `counter = 3`에서 시작한다.
- `setInterval`은 1초 뒤부터 `3`, `2`, `1`을 브로드캐스트하고 그 다음 tick에서 시작한다.
- 사용자 문구는 "N초 후 게임을 시작합니다"지만 실제 시작은 카운트다운 호출 직후 기준 약 4초 뒤에 일어난다.

미완성/위험 지점:

- 카운트다운 취소가 없다.
- 카운트다운 중 누군가 준비를 취소해도 게임 시작은 계속 진행된다.
- 카운트다운 중 플레이어가 나가서 1명만 남아도 시작될 수 있다. `endGameIfOnlyOneLeft`는 `room.started`가 true일 때만 동작한다.
- 카운트다운 중복 시작 방지 플래그가 없다. `allReady && !started`인 상태에서 `/api/ready`가 반복 호출되면 여러 interval이 생길 수 있다.

### 7.5 broadcast

`broadcast`는 현재 room의 모든 client controller에 동일 payload를 enqueue한다. 실패한 controller를 Set에서 제거하지 않는다.

따라서 닫힌 스트림이 남아 있을 경우:

- 매번 try/catch로 실패만 삼킨다.
- 실제 client 정리는 abort/removeClient에 의존한다.

## 8. 게임 시작 후 실제 플레이 흐름

### 8.1 첫 턴

게임 시작 시 `startCountdown`의 마지막 tick에서:

- `room.started = true`
- `room.countdown = null`
- `room.turnNick`이 없으면 `clients` Set의 첫 번째 client 닉네임으로 설정
- `game/start` 이벤트로 `turnNick`, `dice`, `rollsLeft`, `scores` 전송

턴 순서는 `clients` Set 삽입 순서에 의존한다.

### 8.2 주사위 굴림

`Dice3D`의 버튼은 `/api/game/roll-dice`에 `{ roomId, nick }`를 보낸다.

서버 검증:

- `room.turnNick !== nick`이면 403
- `room.rollsLeft <= 0`이면 400

서버 변경:

- held가 아닌 주사위만 `Math.ceil(Math.random() * 6)`으로 갱신
- `rollsLeft--`
- 전체 game state 브로드캐스트

주요 특성:

- 난수는 서버에서 결정된다.
- 주사위 결과는 모든 클라이언트에 동기화된다.
- held 주사위는 value를 유지한다.

미완성/위험 지점:

- `room.started` 여부를 검사하지 않는다.
- `roomId`와 `nick`의 타입/형식 검증이 없다.
- 게임 시작 전 `turnNick`이 null이면 일반 UI로는 호출할 수 없지만 API 자체에는 started guard가 없다.
- `Math.random()`은 게임용으로는 충분할 수 있으나 재현성/감사 가능성은 없다.

### 8.3 주사위 고정/해제

`Dice3D.toggleHold(index)`는 `/api/game/hold-dice`에 `{ roomId, nick, index }`를 보낸다.

서버 검증:

- 현재 턴 닉네임인지 확인
- index가 배열 범위 안인지 확인

서버 변경:

- `room.dice[index].held = !room.dice[index].held`
- 전체 game state 브로드캐스트

미완성/위험 지점:

- 아직 굴리지 않은 `value: null` 주사위도 held로 바꿀 수 있다.
- held가 true인 null 주사위는 다음 roll에서도 값이 생기지 않는다.
- UI 상단의 투명 DiceButton으로 다시 해제할 수는 있지만 사용자에게 명확하지 않다.
- `rollsLeft === 3`, 즉 첫 굴림 전 고정 금지 규칙이 서버에 없다.

### 8.4 3D 주사위 렌더링

`Dice3D`는 모듈 스코프의 전역 싱글턴 `diceBox`를 사용한다.

동작 방식:

- 최초 mount에서 `new DiceBox("#dice-box", ...)` 생성
- `initialize()` 완료 후 `boxRef.current` 설정
- `dice` 또는 `rollsLeft`가 바뀌면, `rollsLeft` 변화 기준으로 3D roll 수행
- `rollsLeft === 3`이면 `box.clearDice()`
- 굴려진 dice id와 원래 dice index를 `diceIdToIndex`에 매핑
- 3D 주사위를 클릭하면 서버에 hold 요청 후 해당 3D 주사위를 제거
- held 해제 시 `box.add("1dpip@value")`로 다시 3D 주사위를 추가

위험 지점:

- DiceBox 초기화가 비동기인데, 초기화 전에 dice/rollsLeft 업데이트가 오면 effect가 return하고 이후 자동 재실행되지 않을 수 있다.
- 전역 싱글턴과 고정 DOM selector `#dice-box`는 방 화면이 재마운트되거나 여러 보드가 생기는 구조와 맞지 않는다.
- `box.roll(...)`을 await하지 않고, 직후 `box.onRollComplete`를 할당한다.
- hook dependency에 `toggleHold`가 빠져 lint 경고가 난다.
- API 응답이 에러여도 `res.ok` 확인 없이 `res.json()`을 호출한다.

## 9. 점수표 동작

`ScoreTable`은 현재 턴 플레이어의 점수만 받는다.

`GameBoard`에서 전달하는 props:

- `scores={scores[turnNick!] ?? {}}`
- `dice={dice.map((d) => d.value)}`
- `disabled={turnNick !== nick}`
- `onUpdate={handleUpdateScores}`

점수 계산은 클라이언트에서만 한다.

현재 구현된 카테고리:

- Ones: 1의 합
- Twos: 2의 합
- Threes: 3의 합
- Fours: 4의 합
- Fives: 5의 합
- Sixes: 6의 합
- FourKind: 같은 숫자 4개 이상이면 전체 합
- FullHouse: 3개 + 2개면 25
- SmallStraight: 1-2-3-4, 2-3-4-5, 3-4-5-6 중 하나면 30
- LargeStraight: 1-2-3-4-5 또는 2-3-4-5-6이면 40
- Chance: 전체 합
- Yahtzee: 같은 숫자 5개면 50

점수 선택 조건:

- 내 턴이 아니면 disabled
- Bonus는 선택 불가
- 이미 점수가 있는 카테고리는 선택 불가
- 아직 null 주사위가 있으면 선택 불가

중요한 서버 신뢰 경계 문제:

- 점수 계산은 서버에서 검증하지 않는다.
- `/api/game/select-score`는 클라이언트가 보낸 `scores` 전체를 그대로 저장한다.
- `/api/game/select-score`는 현재 턴 플레이어인지 검사하지 않는다.
- 이미 선택된 카테고리인지 검사하지 않는다.
- 실제 dice 값으로 계산 가능한 점수인지 검사하지 않는다.
- 첫 roll 여부나 null 주사위 여부도 검사하지 않는다.

즉 현재 점수 시스템은 UI를 정상적으로 클릭하는 경우에만 어느 정도 동작한다. API 호출을 조작하면 점수, 카테고리, 턴 진행을 임의 변경할 수 있다.

## 10. 보너스 처리의 중대한 문제

`ScoreTable`은 상단 합계가 63 이상이면 `bonus = 35`로 계산한다. 그 뒤 effect에서 다음을 실행한다.

```ts
if (bonus && scores.Bonus !== bonus) {
  onUpdate({ ...scores, Bonus: bonus }, '보너스 (+35)');
}
```

이 로직의 문제:

1. `onUpdate`는 `/api/game/select-score`를 호출한다.
2. `/api/game/select-score`는 `lastSelected`가 있으면 무조건 `nextTurn(roomId)`를 호출한다.
3. 따라서 보너스 자동 부여가 턴을 넘긴다.

더 큰 문제:

- `GameBoard`는 모든 클라이언트에서 현재 턴 플레이어의 `scores[turnNick]`를 렌더링한다.
- `ScoreTable`의 보너스 effect는 `disabled`를 보지 않는다.
- 그래서 내 턴이 아닌 클라이언트에서도 현재 턴 플레이어의 upperTotal이 63 이상이면 effect가 실행될 수 있다.
- 그런데 `handleUpdateScores`는 항상 현재 브라우저 사용자의 `nick`을 보낸다.
- 그 결과 비턴 플레이어가 현재 턴 플레이어의 score 객체를 자기 닉네임 아래에 저장시키고, 턴까지 넘길 수 있다.

이 부분은 완성 계획에서 최우선으로 다뤄야 하는 핵심 결함이다.

## 11. 점수 선택 API와 턴 전환

`src/app/api/game/select-score/route.ts`는 `{ roomId, nick, scores, lastSelected }`를 받는다.

현재 흐름:

1. 필수 값 존재 여부만 검사
2. `lastSelected`가 있으면 `updateScores(roomId, nick, scores, lastSelected)`
3. 시스템 메시지 브로드캐스트
4. `nextTurn(roomId)`
5. 현재 state를 응답

누락된 검증:

- 게임이 시작됐는지
- 요청자가 현재 턴 플레이어인지
- `scores`가 기존 점수판과 호환되는지
- 정확히 하나의 카테고리만 새로 채워졌는지
- 해당 카테고리가 아직 비어 있었는지
- 해당 카테고리 점수가 현재 dice로 계산한 값과 일치하는지
- 최소 한 번은 굴렸는지
- 모든 플레이어/모든 카테고리 완료 시 게임이 끝났는지

또한 `lastSelected`는 내부 카테고리 key가 아니라 표시 label이다. 예를 들어 `FourKind`가 아니라 `"Four of a Kind"`가 전송된다. 서버가 규칙을 검증하려면 표시 label과 도메인 key를 분리해야 한다.

## 12. 턴 진행과 게임 종료 상태

현재 턴 진행은 `nextTurn(roomId)` 하나로 처리된다.

`nextTurn` 동작:

- `clients` Set을 배열로 변환
- 현재 `turnNick`의 index를 찾음
- 다음 index의 닉네임을 `turnNick`으로 설정
- `rollsLeft = 3`
- dice를 모두 `{ value: null, held: false }`로 초기화
- `game/update-turn` 브로드캐스트

현재 없는 것:

- 라운드 개념
- 각 플레이어별 완료 카테고리 수에 따른 종료 판정
- 전체 게임 종료 이벤트
- 최종 점수/승자 계산
- 동점 처리
- 재시작/새 게임
- 게임 결과 화면
- 턴 제한 시간
- 비정상 턴 스킵 정책

현재 `getTurnNumber`는 12개 채점 카테고리가 모두 채워지면 `13`을 반환한다. UI는 `/ 12 턴`으로 표시하므로 완주 후 `13 / 12 턴` 상태가 될 수 있다. 모든 카테고리가 채워진 플레이어의 턴이 다시 오면 점수표에서 더 이상 선택할 수 있는 카테고리가 없어 게임이 멈춘다.

## 13. 채팅 흐름

`ChatRoom`은 `RoomProvider.messages`를 렌더링한다. 메시지 입력 후 `/api/chat`에 `{ room, nick, text }`를 POST한다.

`/api/chat`:

- `room`, `nick`, `text` 존재 여부만 확인
- text는 `String(text).slice(0, 2000)`으로 제한
- room의 모든 client에게 `chat` 메시지 브로드캐스트

특성:

- 채팅 히스토리 저장은 없다.
- 늦게 입장한 사용자는 과거 메시지를 보지 못한다.
- 서버는 해당 닉네임이 실제 방에 연결된 사용자인지 확인하지 않는다.
- 게임 시작 이후 새 입장이 가능하다는 SSE 문제와 결합하면, 관전자/외부 사용자가 채팅에 들어올 수 있다.

## 14. 참가자 목록과 준비 UI

`PlayerList`는 `users`를 내 닉네임 우선으로 정렬하고 각 유저의 ready 상태를 표시한다.

내 버튼만 클릭 가능:

- 내 유저가 아니면 disabled
- loading 중이면 disabled
- gameStarted면 disabled

텍스트 문제:

- 게임 시작 후 `u.ready || gameStarted`가 true라서 모든 참가자에게 체크 표시가 붙는다.
- 같은 조건에서 버튼 텍스트는 `"준비 취소"`로 표시되지만, 버튼은 disabled다.
- 실제 의미는 "게임 중" 또는 "준비 완료"에 가깝다.

서버 측 문제:

- `/api/ready`는 게임이 시작된 뒤에도 ready 변경 요청을 받을 수 있다.
- UI가 막고 있을 뿐 서버 guard는 없다.
- `ready`가 boolean인지 검증하지 않는다.

## 15. UI와 접근성/반응형 상태

현재 UI는 기능 프로토타입에 가깝다.

구현된 것:

- shadcn 기반 카드/버튼/입력/체크박스/스크롤 영역
- 다크/라이트/시스템 테마 토글
- 참가자 ready 상태 표시
- SSE 연결 상태 점
- 채팅 자동 스크롤
- 3D 주사위 배경 이미지와 hover overlay

주의할 점:

- 앱 metadata와 화면 제목이 `"Yathzee"`로 표기되어 있다. 일반 명칭은 `"Yahtzee"`지만 의도적 변형인지 오타인지 확인이 필요하다.
- 전체 방 화면은 모바일에서 깨질 가능성이 높다.
- `Card` radius가 shadcn 기본 `rounded-xl`이고 홈 카드도 `rounded-2xl`이다.
- 점수 선택은 체크박스인데, 체크 후 즉시 저장/턴 전환되므로 사용자가 실수했을 때 취소할 수 없다.
- 예측 점수를 행에 표시하지 않고 체크박스만 보여준다. 선택 전에 몇 점이 들어갈지 UI에서 바로 알기 어렵다.
- 3D 주사위와 상단 held dice indicator의 관계가 사용자에게 명확하지 않을 수 있다.

## 16. 정적 검사와 빌드 상태

### 16.1 TypeScript

`pnpm exec tsc --noEmit`는 통과했다.

다만 `skipLibCheck: true`가 켜져 있어서 declaration file 문제 일부는 가려질 수 있다.

### 16.2 ESLint

`pnpm lint`는 실패한다.

에러:

- `src/components/DiceOverlay.tsx`: `Unexpected any`
- `src/lib/roomBus.ts`: `globalThis as any`
- `src/types/dice-box-threejs.d.ts`: `theme_customColorset?: any`

경고:

- `src/components/Dice3D.tsx`: hook dependency `toggleHold` 누락
- `src/components/GameBoard.tsx`: `rollsLeft` unused
- `src/components/ScoreTable.tsx`: hook dependency `onUpdate`, `scores` 누락
- `src/providers/room-provider.tsx`: hook dependency `router` 누락

### 16.3 Build

`pnpm build`는 최종 실패한다.

흐름:

- Turbopack 컴파일 자체는 성공
- 타입/린트 검사 단계에서 ESLint 에러로 실패

추가 경고:

- Next.js가 workspace root를 `/Users/solji/package-lock.json` 기준으로 잘못 추론할 수 있다고 경고한다.
- 현재 프로젝트에는 `pnpm-lock.yaml`이 있고, 상위 `/Users/solji/package-lock.json`도 감지된다.
- `next.config.ts`에서 `turbopack.root`를 지정하면 경고를 줄일 수 있다.

## 17. 테스트 상태

현재 `package.json`에는 테스트 스크립트가 없다.

없는 테스트:

- 점수 계산 단위 테스트
- 턴 전환 테스트
- ready/countdown 테스트
- 퇴장/재접속 테스트
- API validation 테스트
- SSE 메시지 contract 테스트
- 게임 종료/승자 계산 테스트
- UI interaction 테스트

게임 규칙과 상태 전환이 핵심인 프로젝트인데, 현재는 수동 확인에 의존한다.

## 18. 구현 완료된 기능

현재 정상 사용자가 UI를 정직하게 조작한다는 가정 아래 어느 정도 동작하는 기능:

- 닉네임/방 ID 입력
- 방 생성과 입장
- 같은 방의 사용자 목록 표시
- 준비 버튼
- 모든 플레이어 준비 시 카운트다운 후 게임 시작
- SSE 기반 유저/게임 상태 동기화
- 채팅 송수신
- 현재 턴 표시
- 서버 난수 기반 주사위 굴림
- 남은 굴림 횟수 3회 제한
- held가 아닌 주사위만 다시 굴림
- 일부 3D 주사위 렌더링/고정/해제 UI
- 점수표 표시
- 12개 카테고리 점수 계산
- 점수 선택 후 턴 전환
- 명시적 나가기
- 게임 중 1명만 남으면 자동 종료

## 19. 미완성 또는 결함이 큰 기능

완성 계획 전에 반드시 고려해야 할 항목:

1. 서버 권위(authoritative server)가 없다.
   - 점수 계산과 카테고리 검증을 클라이언트가 담당한다.
   - 서버는 클라이언트가 보낸 `scores`를 그대로 저장한다.

2. 점수 선택 API가 현재 턴을 검증하지 않는다.
   - 비턴 플레이어도 API로 점수 저장/턴 전환이 가능하다.

3. 보너스 자동 처리 때문에 턴이 잘못 넘어간다.
   - 특히 비턴 클라이언트에서도 보너스 effect가 실행될 수 있다.

4. 게임 종료가 없다.
   - 모든 카테고리가 채워져도 승자 계산이나 종료 상태가 없다.

5. 카테고리 수/규칙이 불완전하다.
   - 전통 Yahtzee 기준 `Three of a Kind`가 없다.
   - Yahtzee 보너스/Joker 규칙도 없다.
   - 현재는 12턴 게임으로 설계된 상태다.

6. 시작된 방 입장을 SSE가 막지 않는다.
   - 홈 화면 검증을 우회하면 시작된 방에도 들어올 수 있다.

7. 카운트다운 취소/중복 방지가 없다.
   - 준비 취소나 퇴장에도 시작이 계속될 수 있다.

8. 방 상태가 연결과 결합되어 있다.
   - 플레이어와 SSE client가 같은 개념으로 처리된다.
   - 재접속/중복 접속/네트워크 끊김 처리의 안정성이 낮다.

9. 방 저장소가 인메모리뿐이다.
   - 배포 환경에서 안정적인 멀티플레이를 보장하기 어렵다.

10. 빌드가 린트 에러로 실패한다.
    - 실제 배포 가능한 상태가 아니다.

11. 테스트가 없다.
    - 게임 규칙 변경 시 회귀를 막을 안전망이 없다.

## 20. API별 현재 contract 요약

| API                           | 요청                                     | 현재 검증                | 변경 상태                           | 브로드캐스트                       |
| ----------------------------- | ---------------------------------------- | ------------------------ | ----------------------------------- | ---------------------------------- |
| `POST /api/check-room`        | `{ roomId, nick }`                       | 존재, started, 중복 nick | 빈 방 생성 가능                     | 없음                               |
| `GET /api/sse`                | query `room`, `nick`                     | 존재만 확인              | client 추가, 점수판 초기화          | users, state, system               |
| `POST /api/ready`             | `{ room, nick, ready }`                  | room/nick 존재           | ready 변경, 조건부 countdown        | users, countdown/start             |
| `POST /api/chat`              | `{ room, nick, text }`                   | 존재만 확인              | 없음                                | chat                               |
| `POST /api/game/roll-dice`    | `{ roomId, nick }`                       | 현재 턴, rollsLeft       | dice, rollsLeft                     | game/state                         |
| `POST /api/game/hold-dice`    | `{ roomId, nick, index }`                | 현재 턴, index 범위      | dice held 토글                      | game/state                         |
| `POST /api/game/select-score` | `{ roomId, nick, scores, lastSelected }` | 존재만 확인              | scores[nick], nextTurn              | update-scores, system, update-turn |
| `POST /api/game/exit`         | `{ roomId, nick }`                       | 없음                     | client 제거, 조건부 nextTurn/delete | users 또는 force-exit              |

## 21. 도메인 의사결정이 필요한 질문

완성 계획을 세우기 전에 결정해야 할 질문:

1. 게임 규칙은 전통 Yahtzee인가, 한국식 Yacht/Dice Poker 변형인가?
2. 카테고리는 12개로 유지할 것인가, `Three of a Kind`를 포함한 13개로 맞출 것인가?
3. Yahtzee 보너스와 Joker 규칙을 구현할 것인가?
4. 점수 계산은 반드시 서버 권위로 옮길 것인가?
5. 실시간 멀티플레이를 배포까지 고려할 것인가, 로컬/단일 서버 프로토타입으로 둘 것인가?
6. 재접속 정책은 어떻게 할 것인가?
   - 같은 닉네임 재접속 허용
   - 일정 시간 내 복귀 허용
   - 시작 후 신규 입장 금지
   - 관전 모드 허용 여부
7. 게임 종료 후 방은 유지할 것인가 삭제할 것인가?
8. 결과 화면, 재시작, 새 방 이동이 필요한가?
9. 모바일 지원을 필수로 볼 것인가?
10. 채팅 히스토리를 보존할 것인가?

## 22. plan.md 작성 시 우선순위 제안

이 문서는 plan이 아니지만, 계획 수립 시 우선순위를 정하기 위한 관찰은 다음과 같다.

가장 먼저 다뤄야 할 것은 UI 개선이 아니라 게임 상태의 신뢰 경계다.

우선순위가 높은 축:

- 서버 권위 점수 계산
- `select-score` 턴/카테고리/주사위 검증
- 보너스 처리 분리
- 게임 종료 판정
- 시작된 방 입장 차단
- countdown 상태 머신 정리
- player와 connection 분리
- 테스트 추가
- lint/build 통과

그 다음 축:

- 3D 주사위 초기화 안정화
- 재접속 정책
- 모바일 레이아웃
- 점수 예측 UI
- 결과 화면/재시작
- 채팅 히스토리 또는 시스템 메시지 정책

## 23. 결론

현재 프로젝트는 "방에 들어가서 준비하고, SSE로 상태를 맞추며, 주사위를 굴리고 점수를 선택하면 턴이 넘어가는" 핵심 프로토타입은 이미 갖고 있다. 그러나 완성된 야추 게임으로 보기에는 게임 규칙과 상태 전환의 서버 검증이 부족하고, 보너스 처리와 점수 저장 API에는 실제 플레이를 망가뜨릴 수 있는 중대한 결함이 있다.

특히 `select-score`를 서버 권위 모델로 재설계하지 않으면 이후 UI를 다듬어도 게임 정합성을 보장할 수 없다. `plan.md`는 이 리서치를 바탕으로, 먼저 도메인 규칙과 서버 상태 머신을 확정한 뒤 UI/3D/반응형 개선을 얹는 순서로 작성하는 것이 안전하다.
