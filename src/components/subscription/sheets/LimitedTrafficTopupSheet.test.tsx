// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LimitedCompanionTraffic, PurchaseOptions } from '@/types';

/**
 * «Обновить трафик»: платное обнуление лимитного пула до 1-го числа.
 * Деньги уходят только по второму нажатию (подтверждение с ценой), при
 * нехватке баланса вместо кнопки — пополнение.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

const api = vi.hoisted(() => ({
  getLimitedTrafficPackages: vi.fn(),
  purchaseLimitedTraffic: vi.fn(),
  saveLimitedTrafficCart: vi.fn(),
  resetLimitedTraffic: vi.fn(),
}));
vi.mock('../../../api/subscription', () => ({ subscriptionApi: api }));
vi.mock('../../InsufficientBalancePrompt', () => ({
  default: ({ missingAmountKopeks }: { missingAmountKopeks: number }) => (
    <div>{`top-up ${missingAmountKopeks}`}</div>
  ),
}));

import { LimitedTrafficTopupSheet } from './LimitedTrafficTopupSheet';

const traffic = (overrides: Partial<LimitedCompanionTraffic> = {}): LimitedCompanionTraffic => ({
  available: true,
  used_gb: 50,
  base_limit_gb: 50,
  purchased_gb: 0,
  total_limit_gb: 50,
  used_percent: 100,
  reset_price_kopeks: 15000,
  next_reset_at: '2026-11-01T00:00:00Z',
  ...overrides,
});

function open(limitedTraffic: LimitedCompanionTraffic, balance = 20000) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LimitedTrafficTopupSheet
          open
          onOpen={() => {}}
          onClose={() => {}}
          subscriptionId={42}
          limitedTraffic={limitedTraffic}
          selectedTrafficPackage={null}
          onSelectedTrafficPackageChange={() => {}}
          purchaseOptions={{ balance_kopeks: balance } as PurchaseOptions}
          isDark
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getLimitedTrafficPackages.mockResolvedValue([]);
  api.resetLimitedTraffic.mockResolvedValue({
    success: true,
    amount_paid_kopeks: 15000,
    new_balance_kopeks: 5000,
    traffic: traffic({ used_gb: 0, used_percent: 0 }),
  });
});
afterEach(cleanup);

describe('обновить трафик', () => {
  it('списывает только после подтверждения с ценой', async () => {
    open(traffic());

    fireEvent.click(screen.getByRole('button', { name: /150/ }));
    expect(api.resetLimitedTraffic).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /150/ }));
    await waitFor(() => expect(api.resetLimitedTraffic).toHaveBeenCalledWith(42));
  });

  it('без денег предлагает пополнить на недостающую сумму', () => {
    open(traffic(), 5000);

    expect(screen.getByText('top-up 10000')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /150/ })).toBeNull();
  });

  it('без цены блока нет', () => {
    open(traffic({ reset_price_kopeks: 0 }));

    expect(screen.queryByRole('button', { name: /150/ })).toBeNull();
    expect(screen.queryByText(/top-up/)).toBeNull();
  });
});
