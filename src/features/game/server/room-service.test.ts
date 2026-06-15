import { describe, expect, it } from 'vitest';
import {
  applyScoreSelection,
  buildSnapshot,
  joinRoomState,
  setReadyState,
} from '../domain/room-transitions';
import { createRoom } from './room-store';

describe('room-transitions', () => {
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
