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
