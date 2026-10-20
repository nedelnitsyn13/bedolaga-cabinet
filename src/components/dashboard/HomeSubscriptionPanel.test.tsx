// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Subscription } from '@/types';

/**
 * Подписка на главной вместо вкладки «Подписка».
 *
 * Сторожим решения макета: у безлимита нет полосы основного трафика, вместо
 * неё лимитный сервер; ссылка копируется кнопкой в самом поле; плитки
 * действий зависят от подписки (у пробной нет автоплатежа и перевыпуска);
 * «Устройства и трафик» раскрывает докупку прямо на главной.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

const api = vi.hoisted(() => ({
  getDevices: vi.fn(),
  getConnectionLink: vi.fn(),
  getLimitedTraffic: vi.fn(),
  refreshLimitedTraffic: vi.fn(),
  getPurchaseOptions: vi.fn(),
  updateAutopay: vi.fn(),
}));
vi.mock('@/api/subscription', () => ({ subscriptionApi: api }));

const copy = vi.hoisted(() => vi.fn());
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: copy }));

// Тяжёлые блоки со своими запросами проверяются своими тестами.
vi.mock('../subscription/manage/DevicesPanel', () => ({
  DevicesPanel: () => <div>devices-panel</div>,
}));
vi.mock('../subscription/manage/RecurringPanels', () => ({ RecurringPanels: () => null }));
vi.mock('../subscription/manage/DailyPausePanel', () => ({ DailyPausePanel: () => null }));
vi.mock('../subscription/sheets/DeviceTopupSheet', () => ({
  DeviceTopupSheet: () => <div>device-topup</div>,
}));
vi.mock('../subscription/sheets/DeviceReductionSheet', () => ({
  DeviceReductionSheet: () => <div>device-reduction</div>,
}));
vi.mock('../subscription/sheets/TrafficTopupSheet', () => ({
  TrafficTopupSheet: () => <div>traffic-topup</div>,
}));
vi.mock('../subscription/sheets/LimitedTrafficTopupSheet', () => ({
  LimitedTrafficTopupSheet: () => <div>limited-topup</div>,
}));
vi.mock('../subscription/sheets/ServerManagementSheet', () => ({
  ServerManagementSheet: () => null,
}));

import HomeSubscriptionPanel from './HomeSubscriptionPanel';

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 42,
  status: 'active',
  is_trial: false,
  start_date: '2026-08-07T00:00:00Z',
  end_date: '2027-09-10T00:00:00Z',
  days_left: 324,
  hours_left: 0,
  minutes_left: 0,
  time_left_display: '',
  traffic_limit_gb: 0,
  traffic_used_gb: 321,
  traffic_used_percent: 0,
  device_limit: 13,
  connected_squads: [],
  servers: [],
  autopay_enabled: false,
  autopay_days_before: 3,
  subscription_url: 'https://sub.example.org/abc',
  hide_subscription_link: false,
  is_active: true,
  is_expired: false,
  is_limited: false,
  tariff_id: 7,
  tariff_name: 'Базовый',
  ...overrides,
});

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function open(sub: Subscription) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={<HomeSubscriptionPanel subscription={sub} trafficData={null} />}
            />
            <Route path="/connection" element={<div>connection-page</div>} />
          </Routes>
        </MemoryRouter>
      </PlatformProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  copy.mockReset();
  api.getDevices.mockResolvedValue({ devices: [], total: 6, device_limit: 13 });
  api.getConnectionLink.mockResolvedValue({ subscription_url: 'https://sub.example.org/abc' });
  api.getLimitedTraffic.mockResolvedValue({ available: false });
  api.refreshLimitedTraffic.mockResolvedValue({ available: false });
  api.getPurchaseOptions.mockResolvedValue({ sales_mode: 'tariffs' });
  api.updateAutopay.mockResolvedValue({});
});
afterEach(cleanup);

describe('срок и трафик', () => {
  it('безлимит без лимитного сервера: срок есть, полосы трафика нет', async () => {
    open(subscription());

    expect(screen.getByText('324')).toBeTruthy();
    expect(screen.getByText(/2027/)).toBeTruthy();
    expect(await screen.findByText('6 из 13 подключено')).toBeTruthy();
    expect(screen.queryByText('Трафик')).toBeNull();
    expect(screen.queryByText('Лимитный сервер')).toBeNull();
  });

  it('лимитный сервер встаёт на место полосы трафика', async () => {
    const limited = { available: true, used_gb: 2.6, total_limit_gb: 50, used_percent: 5 };
    api.getLimitedTraffic.mockResolvedValue(limited);
    api.refreshLimitedTraffic.mockResolvedValue(limited);
    open(subscription());

    expect(await screen.findByText('Лимитный сервер')).toBeTruthy();
    expect(screen.getByText((text) => text.includes('/') && text.includes('50'))).toBeTruthy();
  });

  it('тариф с лимитом трафика показывает полосу основного трафика', () => {
    open(subscription({ traffic_limit_gb: 250, traffic_used_gb: 22 }));
    expect(screen.getByText('Трафик')).toBeTruthy();
  });
});

describe('ссылка и подключение', () => {
  it('ссылка копируется кнопкой в поле', async () => {
    open(subscription());

    fireEvent.click(await screen.findByRole('button', { name: 'Копировать ссылку' }));
    expect(copy).toHaveBeenCalledWith('https://sub.example.org/abc');
  });

  it('скрытая оператором ссылка не показывается, кнопка подключения остаётся', async () => {
    open(subscription({ hide_subscription_link: true }));

    expect(await screen.findByRole('button', { name: /Подключить устройство/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Копировать ссылку' })).toBeNull();
  });

  it('«Подключить устройство» ведёт на экран подключения', async () => {
    open(subscription());

    fireEvent.click(await screen.findByRole('button', { name: /Подключить устройство/ }));
    expect(await screen.findByText('connection-page')).toBeTruthy();
  });

  it('при исчерпанном лимите — не уходит, а раскрывает докупку', async () => {
    api.getDevices.mockResolvedValue({ devices: [], total: 13, device_limit: 13 });
    open(subscription());

    await screen.findByText('13 из 13 подключено');
    fireEvent.click(screen.getByRole('button', { name: /Подключить устройство/ }));

    expect(screen.queryByText('connection-page')).toBeNull();
    expect(await screen.findByText('device-topup')).toBeTruthy();
  });
});

describe('плитки действий', () => {
  it('платная подписка: продлить, устройства и трафик, автопродление, перевыпуск', () => {
    open(subscription());

    expect(screen.getByRole('link', { name: /Продлить/ }).getAttribute('href')).toBe(
      '/subscription/purchase',
    );
    expect(screen.getByRole('button', { name: /Устройства и трафик/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Автопродление/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Перевыпуск/ })).toBeTruthy();
  });

  it('пробная: купить тариф, без автоплатежа и перевыпуска', () => {
    open(subscription({ is_trial: true }));

    expect(screen.getByRole('link', { name: /Купить тариф/ })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /Перевыпуск/ })).toBeNull();
  });

  it('автопродление переключается одним нажатием', async () => {
    open(subscription({ autopay_enabled: false }));

    const toggle = screen.getByRole('switch', { name: /Автопродление/ });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toContain('Выключено');
    fireEvent.click(toggle);

    await waitFor(() => expect(api.updateAutopay).toHaveBeenCalledWith(true, undefined, undefined));
  });

  it('«Устройства и трафик» раскрывает докупку и уменьшение на главной', async () => {
    open(subscription());

    expect(screen.queryByText('device-topup')).toBeNull();
    const tile = screen.getByRole('button', { name: /Устройства и трафик/ });
    fireEvent.click(tile);

    expect(tile.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('device-topup')).toBeTruthy();
    expect(screen.getByText('device-reduction')).toBeTruthy();
    // Безлимит: докупать основной трафик нечего.
    expect(screen.queryByText('traffic-topup')).toBeNull();
  });
});

it('список устройств тоже на главной', () => {
  open(subscription());
  expect(screen.getByText('devices-panel')).toBeTruthy();
});
