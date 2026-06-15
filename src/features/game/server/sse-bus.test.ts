import { beforeEach, describe, expect, it } from 'vitest';
import {
  addConnection,
  connections,
  getConnection,
  removeConnection,
  type Connection,
} from './sse-bus';

function createConnection(id: string): Connection & { chunks: string[]; closed: boolean } {
  const chunks: string[] = [];
  let closed = false;

  return {
    id,
    nick: 'alice',
    chunks,
    get closed() {
      return closed;
    },
    controller: {
      enqueue(value) {
        chunks.push(new TextDecoder().decode(value));
      },
      close() {
        closed = true;
      },
    } as ReadableStreamDefaultController<Uint8Array>,
  };
}

describe('sse-bus', () => {
  beforeEach(() => {
    connections.clear();
  });

  it('replaces duplicate tab connections without letting stale closes remove the new one', () => {
    const first = createConnection('first');
    const second = createConnection('second');

    addConnection('room-a', first);
    addConnection('room-a', second);

    expect(first.chunks[0]).toContain('force-exit');
    expect(first.closed).toBe(true);
    expect(getConnection('room-a', 'alice')?.id).toBe('second');

    expect(removeConnection('room-a', 'alice', 'first')).toBe(false);
    expect(getConnection('room-a', 'alice')?.id).toBe('second');

    expect(removeConnection('room-a', 'alice', 'second')).toBe(true);
    expect(getConnection('room-a', 'alice')).toBeNull();
  });
});
