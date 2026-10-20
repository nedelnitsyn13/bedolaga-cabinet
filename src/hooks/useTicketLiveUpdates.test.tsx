// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WSMessage } from './useWebSocket';

/**
 * Ответ из Telegram (или админа из бота) должен появляться на открытой странице
 * тикетов без перезагрузки: событие по WebSocket перечитывает список и карточку.
 */

const handlers = vi.hoisted(() => [] as Array<(m: WSMessage) => void>);
vi.mock('./useWebSocket', () => ({
  useWebSocket: ({ onMessage }: { onMessage: (m: WSMessage) => void }) => {
    handlers.push(onMessage);
    return { isConnected: true };
  },
}));

import { useTicketLiveUpdates } from './useTicketLiveUpdates';

function setup(scope: 'admin' | 'user') {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useTicketLiveUpdates(scope), { wrapper });
  const send = (message: WSMessage) => handlers[handlers.length - 1](message);
  const keys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { send, keys };
}

beforeEach(() => {
  handlers.length = 0;
});

it('пользователь: ответ поддержки обновляет список и открытый тикет', () => {
  const { send, keys } = setup('user');

  send({ type: 'ticket.updated', ticket_id: 7 });

  expect(keys()).toEqual([['tickets'], ['ticket', 7]]);
});

it('админ: ответ пользователя обновляет список, карточку и статистику', () => {
  const { send, keys } = setup('admin');

  send({ type: 'ticket.updated', ticket_id: 7, status: 'open' });

  expect(keys()).toEqual([['admin-tickets'], ['admin-ticket', 7], ['admin-ticket-stats']]);
});

it('запрос оценки перечитывает тикет, чтобы блок оценки появился сразу', () => {
  const { send, keys } = setup('user');

  send({ type: 'ticket.csat_requested', ticket_id: 3 });

  expect(keys()).toContainEqual(['ticket', 3]);
});

it('посторонние события ничего не перечитывают', () => {
  const { send, keys } = setup('admin');

  send({ type: 'balance.topup', amount_kopeks: 100 });

  expect(keys()).toEqual([]);
});
