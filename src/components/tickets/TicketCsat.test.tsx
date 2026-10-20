// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/** Оценка поддержки в кабинете: одна кнопка — один запрос, после оценки — спасибо. */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

const rateTicket = vi.hoisted(() => vi.fn());
vi.mock('../../api/tickets', () => ({ ticketsApi: { rateTicket } }));

import { TicketCsat } from './TicketCsat';

function open(rating: number | null) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TicketCsat ticketId={5} rating={rating} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rateTicket.mockReset();
});
afterEach(cleanup);

it('звезда отправляет оценку этого тикета', async () => {
  rateTicket.mockResolvedValue({ id: 5, csat_rating: 4 });
  open(null);

  expect(screen.getByText('Оцените, пожалуйста, работу поддержки')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Оценка 4 из 5' }));

  await waitFor(() => expect(rateTicket).toHaveBeenCalledWith(5, 4));
  expect(rateTicket).toHaveBeenCalledTimes(1);
});

it('ошибка сохранения — понятное сообщение', async () => {
  rateTicket.mockRejectedValue({ isAxiosError: true, response: { status: 409 } });
  open(null);

  fireEvent.click(screen.getByRole('button', { name: 'Оценка 2 из 5' }));

  expect(await screen.findByText('Не удалось сохранить оценку, попробуйте ещё раз')).toBeTruthy();
});

it('после оценки кнопок нет, только благодарность и звёзды', () => {
  open(3);

  expect(screen.getByText(/Спасибо за оценку!/)).toBeTruthy();
  expect(screen.getByLabelText('3/5')).toBeTruthy();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
