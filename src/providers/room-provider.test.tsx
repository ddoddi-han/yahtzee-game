import { createEmptyScoreSheet } from '@/features/game/domain/categories';
import { GameSnapshot, ServerMessage } from '@/features/game/shared/messages';
import { render, screen, act } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomProvider, useGameView, useRoomSnapshot } from './room-provider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  emit(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
  }
}

const snapshot: GameSnapshot = {
  roomId: 'room-a',
  phase: 'playing',
  users: [{ nick: 'alice', ready: true, connected: true }],
  countdown: null,
  turnNick: 'alice',
  scores: { alice: createEmptyScoreSheet() },
  dice: [
    { value: 1, held: false },
    { value: 2, held: false },
    { value: 3, held: false },
    { value: 4, held: false },
    { value: 5, held: false },
  ],
  rollsLeft: 2,
  result: null,
};

function SnapshotProbe() {
  const current = useRoomSnapshot();
  const game = useGameView();

  return (
    <>
      <div data-testid="room">{current?.roomId ?? 'none'}</div>
      <div data-testid="started">{String(game.gameStarted)}</div>
      <div data-testid="turn">{game.turnNick ?? 'none'}</div>
      <div data-testid="rolls">{game.rollsLeft}</div>
    </>
  );
}

describe('RoomProvider', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores snapshots atomically and exposes derived game view data', () => {
    render(
      <RoomProvider roomId="room-a" nick="alice">
        <SnapshotProbe />
      </RoomProvider>
    );

    act(() => {
      MockEventSource.instances[0].emit({ type: 'snapshot', snapshot });
    });

    expect(screen.getByTestId('room')).toHaveTextContent('room-a');
    expect(screen.getByTestId('started')).toHaveTextContent('true');
    expect(screen.getByTestId('turn')).toHaveTextContent('alice');
    expect(screen.getByTestId('rolls')).toHaveTextContent('2');
  });
});
