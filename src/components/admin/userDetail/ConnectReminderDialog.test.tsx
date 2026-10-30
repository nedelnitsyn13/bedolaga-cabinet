// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConnectReminderInfo } from '@/api/adminUsers';

/**
 * «Напомнить подключиться» из карточки: готовый текст можно поправить, отправка
 * уходит с тем, что в поле, а если уже напоминали за сутки — окно об этом говорит.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

const { sendConnectReminder, notify } = vi.hoisted(() => ({
  sendConnectReminder: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/api/adminUsers', () => ({ adminUsersApi: { sendConnectReminder } }));
vi.mock('@/platform/hooks/useNotify', () => ({ useNotify: () => notify }));

import { ConnectReminderDialog } from './ConnectReminderDialog';

const info: ConnectReminderInfo = {
  eligible: true,
  reason: null,
  text: 'Вы ещё не подключились',
  last_sent_at: null,
  cooldown_hours: 24,
};

beforeEach(() => {
  sendConnectReminder.mockReset();
  Object.values(notify).forEach((fn) => {
    fn.mockReset();
  });
});
afterEach(cleanup);

function renderDialog(overrides: Partial<ConnectReminderInfo> = {}) {
  const onClose = vi.fn();
  const onSent = vi.fn();
  render(
    <ConnectReminderDialog
      userId={7}
      info={{ ...info, ...overrides }}
      open
      onClose={onClose}
      onSent={onSent}
    />,
  );
  return { onClose, onSent };
}

it('отправляет поправленный текст и закрывается', async () => {
  sendConnectReminder.mockResolvedValue({ result: 'sent' });
  const { onClose, onSent } = renderDialog();
  const field = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(field.value).toBe('Вы ещё не подключились');

  fireEvent.change(field, { target: { value: '  Подключитесь, пожалуйста  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(sendConnectReminder).toHaveBeenCalledWith(7, 'Подключитесь, пожалуйста');
  expect(onSent).toHaveBeenCalled();
  expect(notify.success).toHaveBeenCalled();
});

it('заблокировавший бота: окно остаётся, ошибка понятная', async () => {
  sendConnectReminder.mockResolvedValue({ result: 'forbidden' });
  const { onClose } = renderDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  expect(notify.error.mock.calls[0][0]).toContain('заблокировал бота');
  expect(onClose).not.toHaveBeenCalled();
});

it('недавнее напоминание видно в окне, старое — нет', () => {
  renderDialog({ last_sent_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
  expect(screen.getByText(/Уже напоминали/)).toBeTruthy();
  cleanup();
  renderDialog({ last_sent_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() });
  expect(screen.queryByText(/Уже напоминали/)).toBeNull();
});
