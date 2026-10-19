// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EmailLogItem, EmailLogResponse } from '@/api/adminUserEmail';

/** Журнал писем: тип и результат словами, чужой адрес — только если почту сменили. */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

const getEmailLog = vi.hoisted(() => vi.fn());
vi.mock('@/api/adminUserEmail', () => ({ adminUserEmailApi: { getEmailLog } }));

import { EmailLogTab } from './EmailLogTab';

function row(partial: Partial<EmailLogItem>): EmailLogItem {
  return {
    id: 1,
    to_email: 'ivan@example.org',
    email_type: 'broadcast',
    subject: 'Новости',
    status: 'sent',
    error: null,
    created_at: '2026-10-18T10:00:00Z',
    ...partial,
  };
}

function renderTab(currentEmail: string | null = 'ivan@example.org') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmailLogTab userId={42} currentEmail={currentEmail} />
    </QueryClientProvider>,
  );
}

beforeEach(() => getEmailLog.mockReset());
afterEach(cleanup);

it('показывает тип, результат и ошибку словами', async () => {
  const data: EmailLogResponse = {
    items: [
      row({
        id: 2,
        email_type: 'password_reset',
        subject: 'Сброс пароля',
        status: 'failed',
        error: '550 mailbox unavailable',
      }),
      row({
        id: 1,
        email_type: 'email_admin_set',
        subject: 'Подтвердите email',
        to_email: 'old@example.org',
      }),
    ],
    total: 2,
    retention_days: 90,
  };
  getEmailLog.mockResolvedValue(data);

  renderTab();

  expect(await screen.findByText('Сброс пароля')).toBeTruthy();
  expect(screen.getByText('Не отправлено')).toBeTruthy();
  expect(screen.getByText('550 mailbox unavailable')).toBeTruthy();
  expect(screen.getByText('Отправлено')).toBeTruthy();
  expect(screen.getByText(/Подтверждение почты \(админ\)/)).toBeTruthy();
  // Письмо ушло на прежний адрес — его видно; на текущий адрес — не дублируется.
  expect(screen.getByText(/old@example\.org/)).toBeTruthy();
  expect(screen.queryByText(/ivan@example\.org/)).toBeNull();
  expect(screen.getByText(/за последние 90 дн\./)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
});

it('незнакомый тип письма не пропадает', async () => {
  getEmailLog.mockResolvedValue({
    items: [row({ email_type: 'webhook_sub_expired' })],
    total: 1,
    retention_days: 90,
  });

  renderTab();

  expect(await screen.findByText(/webhook_sub_expired/)).toBeTruthy();
});

it('«Показать ещё» запрашивает больше строк', async () => {
  getEmailLog.mockResolvedValue({ items: [row({})], total: 120, retention_days: 90 });

  renderTab();

  fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }));
  await waitFor(() => expect(getEmailLog).toHaveBeenLastCalledWith(42, 100));
});

it('пустой журнал', async () => {
  getEmailLog.mockResolvedValue({ items: [], total: 0, retention_days: 30 });

  renderTab();

  expect(await screen.findByText('Писем пока не было.')).toBeTruthy();
});
