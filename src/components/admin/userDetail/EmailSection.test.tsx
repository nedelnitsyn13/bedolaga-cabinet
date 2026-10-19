// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { UserDetailResponse } from '@/api/adminUsers';
import { installMatchMedia } from '@/components/admin/reachability/testUtils';
import { PlatformProvider } from '@/platform/PlatformProvider';

/**
 * Почта пользователя в карточке: админ указывает адрес, на него уходит ссылка,
 * ссылку можно отправить ещё раз, почту — удалить. Ответы бота — словами.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

const api = vi.hoisted(() => ({
  setEmail: vi.fn(),
  resendConfirmation: vi.fn(),
  deleteEmail: vi.fn(),
  getEmailLog: vi.fn(),
}));
vi.mock('@/api/adminUserEmail', () => ({ adminUserEmailApi: api }));

const notify = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@/platform/hooks/useNotify', () => ({ useNotify: () => notify }));

const confirm = vi.hoisted(() => vi.fn());
vi.mock('@/platform/hooks/useNativeDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/hooks/useNativeDialog')>()),
  useDestructiveConfirm: () => confirm,
}));

import { EmailSection } from './EmailSection';

function user(partial: Partial<UserDetailResponse>): UserDetailResponse {
  return { id: 42, email: null, email_verified: false, ...partial } as UserDetailResponse;
}

function renderSection(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </PlatformProvider>
    </QueryClientProvider>,
  );
}

beforeAll(installMatchMedia);
beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(notify), confirm]) fn.mockReset();
});
afterEach(cleanup);

it('админ указывает почту: адрес уходит без пробелов, ссылка — на новый адрес', async () => {
  api.setEmail.mockResolvedValue({
    user_id: 42,
    email: 'ivan@example.org',
    email_verified: false,
    email_sent: true,
  });
  const onChanged = vi.fn();
  renderSection(
    <EmailSection user={user({})} canEdit onChanged={onChanged} onShowLog={() => {}} />,
  );

  expect(screen.getByText('не указана')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Указать почту' }));

  const input = screen.getByLabelText('Новый адрес');
  const submit = screen.getByRole('button', { name: 'Сохранить и отправить ссылку' });
  fireEvent.change(input, { target: { value: 'не адрес' } });
  expect((submit as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(input, { target: { value: '  ivan@example.org ' } });
  fireEvent.click(submit);

  await waitFor(() => expect(api.setEmail).toHaveBeenCalledWith(42, 'ivan@example.org'));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Ссылка подтверждения отправлена на ivan@example.org',
    ),
  );
  expect(onChanged).toHaveBeenCalled();
});

it('письмо не ушло — предупреждение, а не «отправлено»', async () => {
  api.setEmail.mockResolvedValue({
    user_id: 42,
    email: 'ivan@example.org',
    email_verified: false,
    email_sent: false,
  });
  renderSection(<EmailSection user={user({})} canEdit onChanged={() => {}} onShowLog={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Указать почту' }));
  fireEvent.change(screen.getByLabelText('Новый адрес'), {
    target: { value: 'ivan@example.org' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и отправить ссылку' }));

  await waitFor(() => expect(notify.warning).toHaveBeenCalled());
  expect(notify.success).not.toHaveBeenCalled();
});

it('отказ бота показывается словами', async () => {
  api.setEmail.mockRejectedValue({
    isAxiosError: true,
    response: { status: 409, data: { detail: 'This email is already registered' } },
  });
  renderSection(<EmailSection user={user({})} canEdit onChanged={() => {}} onShowLog={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Указать почту' }));
  fireEvent.change(screen.getByLabelText('Новый адрес'), {
    target: { value: 'ivan@example.org' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и отправить ссылку' }));

  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      'Этот адрес уже привязан к другому аккаунту.',
      expect.anything(),
    ),
  );
});

it('неподтверждённая почта: ссылку можно отправить ещё раз', async () => {
  api.resendConfirmation.mockResolvedValue({
    user_id: 42,
    email: 'ivan@example.org',
    email_verified: false,
    email_sent: true,
  });
  renderSection(
    <EmailSection
      user={user({ email: 'ivan@example.org', email_verified: false })}
      canEdit
      onChanged={() => {}}
      onShowLog={() => {}}
    />,
  );

  expect(screen.getByText('ждёт подтверждения')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку ещё раз' }));
  await waitFor(() => expect(api.resendConfirmation).toHaveBeenCalledWith(42));
});

it('подтверждённую почту повторно не подтверждают', () => {
  renderSection(
    <EmailSection
      user={user({ email: 'ivan@example.org', email_verified: true })}
      canEdit
      onChanged={() => {}}
      onShowLog={() => {}}
    />,
  );

  expect(screen.getByText('подтверждена')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Отправить ссылку ещё раз' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Изменить' })).toBeTruthy();
});

it('удаление — только после подтверждения', async () => {
  api.deleteEmail.mockResolvedValue({
    user_id: 42,
    email: null,
    email_verified: false,
    email_sent: null,
  });
  renderSection(
    <EmailSection
      user={user({ email: 'ivan@example.org', email_verified: true })}
      canEdit
      onChanged={() => {}}
      onShowLog={() => {}}
    />,
  );

  confirm.mockResolvedValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Удалить почту' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(api.deleteEmail).not.toHaveBeenCalled();

  confirm.mockResolvedValueOnce(true);
  fireEvent.click(screen.getByRole('button', { name: 'Удалить почту' }));
  await waitFor(() => expect(api.deleteEmail).toHaveBeenCalledWith(42));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Почта удалена'));
});

it('без права редактирования — только просмотр', () => {
  const onShowLog = vi.fn();
  renderSection(
    <EmailSection
      user={user({ email: 'ivan@example.org', email_verified: false })}
      canEdit={false}
      onChanged={() => {}}
      onShowLog={onShowLog}
    />,
  );

  expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Удалить почту' })).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: /Письма/ })[0]);
  expect(onShowLog).toHaveBeenCalled();
});
