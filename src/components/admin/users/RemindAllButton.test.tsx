// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * «Напомнить всем»: число получателей считает бот, отправка — только после
 * подтверждения, а если писать некому — никакого подтверждения и отправки.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

const { getConnectReminderAudience, sendConnectReminderBulk, confirm, notify } = vi.hoisted(() => ({
  getConnectReminderAudience: vi.fn(),
  sendConnectReminderBulk: vi.fn(),
  confirm: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/api/adminUsers', () => ({
  adminUsersApi: { getConnectReminderAudience, sendConnectReminderBulk },
}));
vi.mock('@/platform/hooks/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/platform/hooks/useNativeDialog', () => ({ useNativeDialog: () => ({ confirm }) }));

import { RemindAllButton } from './RemindAllButton';

beforeEach(() => {
  [getConnectReminderAudience, sendConnectReminderBulk, confirm].forEach((fn) => {
    fn.mockReset();
  });
  Object.values(notify).forEach((fn) => {
    fn.mockReset();
  });
});
afterEach(cleanup);

it('подтверждение с числом получателей и пропущенных, затем запуск', async () => {
  getConnectReminderAudience.mockResolvedValue({
    count: 12,
    skipped_recent: 3,
    cooldown_hours: 24,
  });
  confirm.mockResolvedValue(true);
  sendConnectReminderBulk.mockResolvedValue({ queued: 12 });

  render(<RemindAllButton />);
  fireEvent.click(screen.getByRole('button'));

  await waitFor(() => expect(sendConnectReminderBulk).toHaveBeenCalled());
  expect(confirm.mock.calls[0][0]).toContain('12');
  expect(confirm.mock.calls[0][0]).toContain('3');
  expect(notify.success.mock.calls[0][0]).toContain('12');
});

it('отказ в подтверждении — ничего не отправляем', async () => {
  getConnectReminderAudience.mockResolvedValue({ count: 5, skipped_recent: 0, cooldown_hours: 24 });
  confirm.mockResolvedValue(false);
  render(<RemindAllButton />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  expect(sendConnectReminderBulk).not.toHaveBeenCalled();
});

it('некому писать — сообщаем и не спрашиваем подтверждения', async () => {
  getConnectReminderAudience.mockResolvedValue({ count: 0, skipped_recent: 4, cooldown_hours: 24 });
  render(<RemindAllButton />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(notify.info).toHaveBeenCalled());
  expect(confirm).not.toHaveBeenCalled();
  expect(sendConnectReminderBulk).not.toHaveBeenCalled();
});
