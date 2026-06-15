import { NotFoundGameError } from '../domain/errors';
import { Player, RoomState, createInitialDice } from '../domain/state';

type GlobalRooms = {
  __yahtzeeRooms__?: Map<string, RoomState>;
  __yahtzeeRoomRuntimes__?: Map<string, RoomRuntimeState>;
};

export type RoomRuntimeState = {
  countdownTimer: ReturnType<typeof setInterval> | null;
};

const globalRooms = globalThis as typeof globalThis & GlobalRooms;

if (!globalRooms.__yahtzeeRooms__) {
  globalRooms.__yahtzeeRooms__ = new Map<string, RoomState>();
}

if (!globalRooms.__yahtzeeRoomRuntimes__) {
  globalRooms.__yahtzeeRoomRuntimes__ = new Map<string, RoomRuntimeState>();
}

export const rooms = globalRooms.__yahtzeeRooms__;
export const roomRuntimes = globalRooms.__yahtzeeRoomRuntimes__;

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

export function requireRoom(roomId: string) {
  const room = peekRoom(roomId);
  if (!room) throw new NotFoundGameError('방을 찾을 수 없습니다.');
  return room;
}

export function getRoomRuntime(roomId: string) {
  let runtime = roomRuntimes.get(roomId);
  if (!runtime) {
    runtime = { countdownTimer: null };
    roomRuntimes.set(roomId, runtime);
  }
  return runtime;
}

export function removeRoomRuntime(roomId: string) {
  roomRuntimes.delete(roomId);
}
