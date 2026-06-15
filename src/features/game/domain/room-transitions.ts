import { SCORE_CATEGORIES, ScoreCategory, createEmptyScoreSheet } from './categories';
import { assertRolledDice, resetDice, rollDice } from './dice';
import { ForbiddenGameActionError, GameError, NotFoundGameError } from './errors';
import { calculateBonus, calculateScore, calculateTotal, isScoreSheetComplete } from './scoring';
import { Player, RoomEvent, RoomState } from './state';
import { GameSnapshot } from '../shared/messages';

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

export function assertCanJoinRoom(room: RoomState, nick: string) {
  if (room.phase === 'playing' || room.phase === 'finished') {
    throw new ForbiddenGameActionError('이미 시작된 방에는 입장할 수 없습니다.');
  }

  const existing = room.players.get(nick);
  if (existing?.connected) {
    throw new ForbiddenGameActionError('이미 사용 중인 닉네임입니다.');
  }
}

export function joinRoomState(room: RoomState, nick: string) {
  const isNewPlayer = !room.players.has(nick);
  if (!isNewPlayer) {
    addPlayer(room, nick);
    return;
  }

  assertCanJoinRoom(room, nick);
  addPlayer(room, nick);
  appendEvent(room, { type: 'system', text: `${nick}님이 입장했습니다.` });
}

export function setReadyState(room: RoomState, nick: string, ready: boolean) {
  if (room.phase !== 'lobby' && room.phase !== 'countdown') {
    throw new GameError('게임 중에는 준비 상태를 바꿀 수 없습니다.');
  }

  const player = room.players.get(nick);
  if (!player) throw new NotFoundGameError('플레이어가 방에 없습니다.');

  player.ready = ready;
  const players = [...room.players.values()].filter(p => p.connected);
  const allReady = players.length >= 2 && players.every(p => p.ready);

  if (allReady) {
    room.phase = 'countdown';
    room.countdown = 3;
  } else if (room.phase === 'countdown') {
    cancelCountdown(room);
  }
}

export function cancelCountdown(room: RoomState) {
  room.countdown = null;
  room.phase = 'lobby';
}

export function startGame(room: RoomState) {
  const players = [...room.players.values()].filter(p => p.connected);
  if (players.length < 2) {
    throw new GameError('게임을 시작하려면 2명 이상 필요합니다.');
  }
  if (!players.every(player => player.ready)) {
    throw new GameError('모든 플레이어가 준비되어야 합니다.');
  }

  room.phase = 'playing';
  room.countdown = null;
  room.turnOrder = players.map(player => player.nick);
  room.turnIndex = 0;
  room.dice = resetDice();
  room.rollsLeft = 3;
  room.result = null;
}

export function rollCurrentTurn(room: RoomState, nick: string) {
  assertPlayingTurn(room, nick);
  if (room.rollsLeft <= 0) throw new GameError('더 이상 굴릴 수 없습니다.');

  room.dice = rollDice(room.dice);
  room.rollsLeft -= 1;
}

export function toggleHeldDieState(room: RoomState, nick: string, index: number) {
  assertPlayingTurn(room, nick);
  if (room.rollsLeft === 3) {
    throw new GameError('첫 굴림 전에는 주사위를 고정할 수 없습니다.');
  }

  const die = room.dice[index];
  if (!die || die.value === null) {
    throw new GameError('굴린 주사위만 고정할 수 있습니다.');
  }

  die.held = !die.held;
}

export function applyScoreSelection(
  room: RoomState,
  input: { nick: string; category: ScoreCategory }
) {
  assertPlayingTurn(room, input.nick);
  if (room.rollsLeft === 3) {
    throw new GameError('점수를 선택하기 전에 한 번 이상 굴려야 합니다.');
  }

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

export function appendChatEvent(room: RoomState, input: { nick: string; text: string }) {
  if (!room.players.has(input.nick)) {
    throw new ForbiddenGameActionError('플레이어가 방에 없습니다.');
  }

  return appendEvent(room, {
    type: 'chat',
    nick: input.nick,
    text: input.text,
  });
}

export function markPlayerDisconnected(room: RoomState, nick: string) {
  const player = room.players.get(nick);
  if (!player) return false;

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

  appendEvent(room, { type: 'system', text: `${nick}님이 퇴장했습니다.` });
  return true;
}

export function resetRoomForRestart(room: RoomState) {
  for (const player of room.players.values()) {
    player.ready = false;
    player.scoreSheet = createEmptyScoreSheet();
  }

  room.phase = 'lobby';
  room.turnIndex = 0;
  room.turnOrder = [...room.players.keys()];
  room.dice = resetDice();
  room.rollsLeft = 3;
  room.countdown = null;
  room.result = null;
}

function addPlayer(room: RoomState, nick: string) {
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

function appendEvent(room: RoomState, event: Omit<RoomEvent, 'id' | 'roomId' | 'at'>) {
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
  if (getTurnNick(room) !== nick) {
    throw new ForbiddenGameActionError('Not your turn');
  }
}
