import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomMessage } from '../shared/messages';
import { mergeRoomMessages, useRoomMessages } from './use-room-messages';

const oldMessage: RoomMessage = {
  id: 'old',
  type: 'system',
  text: 'old',
  at: 1,
};

const duplicateMessage: RoomMessage = {
  id: 'live',
  type: 'chat',
  nick: 'alice',
  text: 'live duplicate',
  at: 2,
};

const liveMessage: RoomMessage = {
  id: 'live',
  type: 'chat',
  nick: 'alice',
  text: 'live',
  at: 2,
};

vi.mock('@/providers/room-provider', () => ({
  useRoomSession: () => ({ roomId: 'room-a', nick: 'alice' }),
  useLiveRoomMessages: () => [liveMessage],
}));

function MessagesProbe() {
  const { messages, hasOlderMessages, loadOlderMessages } = useRoomMessages();

  return (
    <>
      <button type="button" onClick={loadOlderMessages}>
        load
      </button>
      <div data-testid="has-older">{String(hasOlderMessages)}</div>
      <ul>
        {messages.map(message => (
          <li key={message.id}>{message.text}</li>
        ))}
      </ul>
    </>
  );
}

describe('useRoomMessages', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nodes: [duplicateMessage, oldMessage],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: false },
        }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges history before live messages and removes duplicates by id', () => {
    expect(mergeRoomMessages([duplicateMessage, oldMessage], [liveMessage])).toEqual([
      oldMessage,
      liveMessage,
    ]);
  });

  it('loads initial history and hides the older messages button when there are no older pages', async () => {
    render(<MessagesProbe />);

    await waitFor(() => {
      expect(screen.getByText('old')).toBeInTheDocument();
    });
    expect(screen.getByText('live')).toBeInTheDocument();
    expect(screen.getByTestId('has-older')).toHaveTextContent('false');
  });

  it('loads older messages through cursor pagination state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        nodes: [liveMessage],
        pageInfo: { endCursor: 'cursor-live', hasNextPage: true },
      }),
    } as Response);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        nodes: [oldMessage],
        pageInfo: { endCursor: 'cursor-old', hasNextPage: false },
      }),
    } as Response);

    render(<MessagesProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('has-older')).toHaveTextContent('true');
    });

    await userEvent.click(screen.getByRole('button', { name: 'load' }));

    await waitFor(() => {
      expect(screen.getByText('old')).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/chat/history',
      expect.objectContaining({
        body: JSON.stringify({
          roomId: 'room-a',
          pagination: { limit: 30, before: 'cursor-live' },
        }),
      })
    );
    expect(screen.getByTestId('has-older')).toHaveTextContent('false');
  });
});
