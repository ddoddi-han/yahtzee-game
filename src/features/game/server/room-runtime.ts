import { ScoreCategory } from '../domain/categories';
import { ForbiddenGameActionError } from '../domain/errors';
import {
  appendChatEvent,
  applyScoreSelection,
  assertCanJoinRoom,
  buildSnapshot,
  cancelCountdown,
  joinRoomState,
  markPlayerDisconnected,
  resetRoomForRestart,
  rollCurrentTurn,
  setReadyState,
  startGame,
  toggleHeldDieState,
} from '../domain/room-transitions';
import { RoomState } from '../domain/state';
import { broadcast } from './sse-bus';
import {
  getOrCreateRoom,
  getRoomRuntime,
  peekRoom,
  removeRoomRuntime,
  requireRoom,
  rooms,
} from './room-store';

export {
  applyScoreSelection,
  buildSnapshot,
  joinRoomState,
  setReadyState,
} from '../domain/room-transitions';

export function getRoomSnapshot(roomId: string) {
  const room = requireRoom(roomId);
  return { ...buildSnapshot(room), events: room.events };
}

export function broadcastSnapshot(room: RoomState) {
  broadcast(room.roomId, { type: 'snapshot', snapshot: buildSnapshot(room) });
}

export function canJoinRoom(roomId: string, nick: string) {
  const room = peekRoom(roomId);
  if (!room) return;
  assertCanJoinRoom(room, nick);
}

export function joinRoom(roomId: string, nick: string) {
  const room = getOrCreateRoom(roomId);
  joinRoomState(room, nick);
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function setReady(roomId: string, nick: string, ready: boolean) {
  const room = requireRoom(roomId);
  const wasCountdown = room.phase === 'countdown';

  setReadyState(room, nick, ready);
  if (room.phase === 'countdown') {
    maybeStartCountdown(room);
  } else if (wasCountdown) {
    clearCountdownTimer(room.roomId);
  }

  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function maybeStartCountdown(room: RoomState) {
  const runtime = getRoomRuntime(room.roomId);
  if (room.phase !== 'countdown' || runtime.countdownTimer) return;

  runtime.countdownTimer = setInterval(() => {
    const players = [...room.players.values()].filter(p => p.connected);
    if (players.length < 2 || !players.every(player => player.ready)) {
      cancelCountdown(room);
      clearCountdownTimer(room.roomId);
      broadcastSnapshot(room);
      return;
    }

    if (room.countdown && room.countdown > 1) {
      room.countdown -= 1;
      broadcastSnapshot(room);
      return;
    }

    clearCountdownTimer(room.roomId);
    startGame(room);
    broadcastSnapshot(room);
  }, 1000);
}

export function rollCurrentTurnDice(input: { roomId: string; nick: string }) {
  const room = requireRoom(input.roomId);
  rollCurrentTurn(room, input.nick);
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function toggleHeldDie(input: { roomId: string; nick: string; index: number }) {
  const room = requireRoom(input.roomId);
  toggleHeldDieState(room, input.nick, input.index);
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function selectScore(input: { roomId: string; nick: string; category: ScoreCategory }) {
  const room = requireRoom(input.roomId);
  applyScoreSelection(room, input);
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function sendChat(input: { roomId: string; nick: string; text: string }) {
  const room = requireRoom(input.roomId);
  const event = appendChatEvent(room, input);

  broadcast(input.roomId, {
    type: 'chat',
    id: event.id,
    nick: input.nick,
    text: input.text,
    at: event.at,
  });

  return { ok: true };
}

export function markDisconnected(roomId: string, nick: string) {
  const room = requireRoom(roomId);
  const wasCountdown = room.phase === 'countdown';

  markPlayerDisconnected(room, nick);
  if (wasCountdown && room.phase !== 'countdown') {
    clearCountdownTimer(roomId);
  }

  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function restartRoom(roomId: string, nick: string) {
  const room = requireRoom(roomId);
  if (!room.players.has(nick)) {
    throw new ForbiddenGameActionError('플레이어가 방에 없습니다.');
  }

  clearCountdownTimer(roomId);
  resetRoomForRestart(room);
  broadcastSnapshot(room);
  return buildSnapshot(room);
}

export function removeRoomIfEmpty(roomId: string) {
  const room = peekRoom(roomId);
  if (!room) return;
  if ([...room.players.values()].every(player => !player.connected)) {
    clearCountdownTimer(roomId);
    removeRoomRuntime(roomId);
    rooms.delete(roomId);
  }
}

function clearCountdownTimer(roomId: string) {
  const runtime = getRoomRuntime(roomId);
  if (runtime.countdownTimer) clearInterval(runtime.countdownTimer);
  runtime.countdownTimer = null;
}
