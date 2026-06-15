import { z } from 'zod';

export const paginationInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(30),
    before: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
  })
  .refine(input => !(input.before && input.after), {
    message: 'Use either before or after, not both.',
    path: ['before'],
  });

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export type PageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

export type ConnectionPage<T> = {
  nodes: T[];
  pageInfo: PageInfo;
};

export function encodeCursor(item: { at: number; id: string }) {
  return Buffer.from(JSON.stringify({ at: item.at, id: item.id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string) {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    at: number;
    id: string;
  };

  if (!Number.isFinite(parsed.at) || !parsed.id) {
    throw new Error('Invalid cursor');
  }

  return parsed;
}

export function pageByInput<T extends { at: number; id: string }>(
  items: readonly T[],
  input: PaginationInput
): ConnectionPage<T> {
  const sorted = [...items].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  const cursor = input.before ?? input.after;
  const decoded = cursor ? decodeCursor(cursor) : null;

  const filtered = decoded
    ? sorted.filter(item => {
        if (input.before) {
          return item.at < decoded.at || (item.at === decoded.at && item.id < decoded.id);
        }
        return item.at > decoded.at || (item.at === decoded.at && item.id > decoded.id);
      })
    : sorted;

  const nodes = filtered.slice(0, input.limit);
  const startCursor = nodes[0] ? encodeCursor(nodes[0]) : null;
  const endCursor = nodes[nodes.length - 1] ? encodeCursor(nodes[nodes.length - 1]) : null;

  return {
    nodes,
    pageInfo: {
      hasNextPage: filtered.length > input.limit,
      hasPreviousPage: Boolean(cursor),
      startCursor,
      endCursor,
    },
  };
}
