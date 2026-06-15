import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, requireRoom, roomRuntimes, rooms } from './room-store';
import {
  joinRoom,
  joinRoomState,
  rollCurrentTurnDice,
  sendChat,
  getRoomSnapshot,
  restartRoom,
  scheduleDisconnect,
} from './room-runtime';

describe('room-runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rooms.clear();
    roomRuntimes.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not create rooms for actions outside the join flow', () => {
    expect(() => rollCurrentTurnDice({ roomId: 'missing', nick: 'alice' })).toThrow(
      '방을 찾을 수 없습니다.'
    );
    expect(() => sendChat({ roomId: 'missing', nick: 'alice', text: 'hi' })).toThrow(
      '방을 찾을 수 없습니다.'
    );
    expect(() => restartRoom('missing', 'alice')).toThrow('방을 찾을 수 없습니다.');

    expect(rooms.has('missing')).toBe(false);
  });

  it('does not duplicate entrance events when the same player reconnects', () => {
    const room = createRoom('room-a');

    joinRoomState(room, 'alice');
    room.players.get('alice')!.connected = false;
    joinRoomState(room, 'alice');

    expect(room.players.get('alice')?.connected).toBe(true);
    expect(room.events.filter(event => event.text === 'alice님이 입장했습니다.')).toHaveLength(1);
  });

  it('reads existing room snapshots without creating missing rooms', () => {
    expect(() => getRoomSnapshot('missing')).toThrow('방을 찾을 수 없습니다.');
    expect(rooms.has('missing')).toBe(false);
  });

  it('keeps a playing room member when they reconnect before the grace timeout', () => {
    joinRoom('room-a', 'alice');
    joinRoom('room-a', 'bob');
    const room = requireRoom('room-a');
    room.phase = 'playing';
    room.turnOrder = ['alice', 'bob'];
    room.turnIndex = 0;

    scheduleDisconnect('room-a', 'alice', 10_000);
    vi.advanceTimersByTime(9_000);
    joinRoom('room-a', 'alice');
    vi.advanceTimersByTime(1_000);

    expect(room.players.get('alice')?.connected).toBe(true);
    expect(room.phase).toBe('playing');
  });

  it('disconnects a playing room member after the grace timeout expires', () => {
    joinRoom('room-a', 'alice');
    joinRoom('room-a', 'bob');
    const room = requireRoom('room-a');
    room.phase = 'playing';
    room.turnOrder = ['alice', 'bob'];
    room.turnIndex = 0;

    scheduleDisconnect('room-a', 'alice', 10_000);
    vi.advanceTimersByTime(10_000);

    expect(room.players.get('alice')?.connected).toBe(false);
    expect(room.phase).toBe('finished');
  });
});
