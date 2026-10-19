// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * Ссылка «почту указал администратор» подтверждает адрес и в аккаунт не входит:
 * страница не сохраняет токенов входа и отправляет одноразовый код ровно один раз.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);
vi.mock('@/components/LanguageSwitcher', () => ({ default: () => null }));

const confirmAdminSetEmail = vi.hoisted(() => vi.fn());
const verifyEmail = vi.hoisted(() => vi.fn());
vi.mock('@/api/auth', () => ({ authApi: { confirmAdminSetEmail, verifyEmail } }));

import ConfirmEmail from './ConfirmEmail';

function open(url: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <ConfirmEmail />
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  confirmAdminSetEmail.mockReset();
  verifyEmail.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

it('подтверждает почту один раз и не входит в аккаунт', async () => {
  confirmAdminSetEmail.mockResolvedValue({ success: true, email: 'ivan@example.org' });

  open('/confirm-email?token=adm_abc');

  expect(await screen.findByText('Почта подтверждена')).toBeTruthy();
  expect(screen.getByText(/ivan@example\.org/)).toBeTruthy();
  expect(confirmAdminSetEmail).toHaveBeenCalledTimes(1);
  expect(confirmAdminSetEmail).toHaveBeenCalledWith('adm_abc');
  expect(verifyEmail).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(screen.getByRole('link', { name: 'Перейти к входу' }).getAttribute('href')).toBe('/login');
});

it('просроченная ссылка — понятная причина', async () => {
  confirmAdminSetEmail.mockRejectedValue({
    isAxiosError: true,
    response: { status: 400, data: { detail: 'Verification token has expired' } },
  });

  open('/confirm-email?token=adm_old');

  expect(await screen.findByText('Срок действия ссылки истёк.')).toBeTruthy();
});

it('использованная ссылка — понятная причина', async () => {
  confirmAdminSetEmail.mockRejectedValue({
    isAxiosError: true,
    response: { status: 400, data: { detail: 'Invalid verification token' } },
  });

  open('/confirm-email?token=adm_used');

  expect(await screen.findByText('Ссылка недействительна или уже использована.')).toBeTruthy();
});

it('без токена запрос не отправляется', async () => {
  open('/confirm-email');

  await waitFor(() => expect(screen.getByText('В ссылке нет кода подтверждения.')).toBeTruthy());
  expect(confirmAdminSetEmail).not.toHaveBeenCalled();
});
