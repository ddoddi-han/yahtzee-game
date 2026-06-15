import { beforeEach, describe, expect, it } from 'vitest';
import { createRoom, rooms } from './room-store';
import {
  joinRoomState,
  rollCurrentTurnDice,
  sendChat,
  getRoomSnapshot,
  restartRoom,
} from './room-runtime';

describe('room-runtime', () => {
  beforeEach(() => {
    rooms.clear();
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
});
