// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { UserSubscriptionInfo } from '@/api/adminUsers';

/**
 * Компаньон лимитного сервера — отдельный аккаунт панели со своей квотой
 * трафика, поэтому строка «Трафик» в карточке подписки про него ничего не
 * говорит: админ видел «3.0 / 100 ГБ» и не мог понять, выбран ли лимитный
 * сервер. А `limited_companion_traffic_used_gb` пишут только докупка и
 * фоновый мониторинг — значит, цифру надо уметь обновлять руками.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

import { SubscriptionTab, type SubscriptionTabProps } from './SubscriptionTab';

afterEach(cleanup);

function subscription(overrides: Partial<UserSubscriptionInfo> = {}): UserSubscriptionInfo {
  return {
    id: 42,
    status: 'active',
    is_trial: false,
    start_date: null,
    end_date: '2026-12-01T00:00:00Z',
    traffic_limit_gb: 100,
    traffic_used_gb: 3,
    device_limit: 3,
    tariff_id: null,
    tariff_name: null,
    autopay_enabled: false,
    is_active: true,
    days_remaining: 30,
    purchased_traffic_gb: 0,
    traffic_purchases: [],
    has_limited_companion: true,
    limited_companion_traffic_limit_gb: 50,
    limited_companion_traffic_used_gb: 12.5,
    limited_companion_purchased_traffic_gb: 0,
    limited_companion_panel_id: 857,
    sbp_recurring_status: null,
    sbp_recurring_id: null,
    ...overrides,
  } as UserSubscriptionInfo;
}

const noop = () => {};
const asyncNoop = () => Promise.resolve();

function renderTab(overrides: Partial<SubscriptionTabProps> = {}) {
  const sub = overrides.selectedSub ?? subscription();
  const props: SubscriptionTabProps = {
    userSubscriptions: [sub],
    selectedSub: sub,
    activeSubscriptionId: sub.id,
    onActiveSubscriptionChange: noop,
    subscriptionDetailView: true,
    onSubscriptionDetailViewChange: noop,
    tariffs: [],
    currentTariff: null,
    subAction: 'extend',
    subDays: 30,
    onSubActionChange: noop,
    onSubDaysChange: noop,
    selectedTariffId: null,
    onSelectedTariffIdChange: noop,
    selectedTrafficGb: '',
    onSelectedTrafficGbChange: noop,
    limitedTrafficGb: '',
    onLimitedTrafficGbChange: noop,
    onAddLimitedTraffic: asyncNoop,
    onSyncLimitedCompanion: asyncNoop,
    panelInfo: null,
    panelInfoLoading: false,
    copyToClipboard: noop,
    formatBytes: (bytes: number) => `${bytes}B`,
    nodeUsageDays: 7,
    onNodeUsageDaysChange: noop,
    nodeUsageForPeriod: [],
    devices: [],
    devicesLoading: false,
    devicesTotal: 0,
    deviceLimit: 3,
    editingDeviceHwid: null,
    editingDeviceName: '',
    onEditingDeviceHwidChange: noop,
    onEditingDeviceNameChange: noop,
    renameSaving: false,
    requestHistory: [],
    requestHistoryLoading: false,
    requestHistoryTotal: 0,
    requestHistoryOffset: 0,
    requestHistorySubId: null,
    requestHistoryExpanded: false,
    onRequestHistoryExpandedChange: noop,
    onRequestHistorySubIdChange: noop,
    actionLoading: false,
    confirmingAction: null,
    onInlineConfirm: noop,
    onUpdateSubscription: asyncNoop,
    onSetDeviceLimit: asyncNoop,
    onAddTraffic: asyncNoop,
    onRemoveTraffic: asyncNoop,
    onResetDevices: asyncNoop,
    onCancelSbpRecurring: asyncNoop,
    onDeleteSubscription: asyncNoop,
    onDeleteDevice: asyncNoop,
    onRenameDevice: asyncNoop,
    onLoadDevices: asyncNoop,
    onLoadSubscriptionData: asyncNoop,
    onLoadRequestHistory: asyncNoop,
    hasPermission: () => true,
    formatDate: (date: string | null) => date ?? '—',
    locale: 'ru',
    reachabilityLink: null,
    ...overrides,
  };

  return render(
    <MemoryRouter>
      <SubscriptionTab {...props} />
    </MemoryRouter>,
  );
}

it('показывает использованный трафик компаньона, а не только его лимит', () => {
  renderTab();

  expect(screen.getByText('Лимитный профиль')).toBeTruthy();
  // Своя квота компаньона (50), а не 100 ГБ основной подписки.
  expect(screen.getByText(/12\.5 \/ 50/)).toBeTruthy();
  expect(screen.getByText(/857/)).toBeTruthy();
});

it('отдельной строкой сообщает про активные докупки', () => {
  renderTab({
    selectedSub: subscription({
      limited_companion_purchased_traffic_gb: 30,
      limited_companion_traffic_limit_gb: 80,
    }),
  });

  expect(screen.getByText(/12\.5 \/ 80/)).toBeTruthy();
  expect(screen.getByText('Из них докуплено: 30 ГБ')).toBeTruthy();
});

it('показывает безлимит как ∞, а не как ноль', () => {
  renderTab({ selectedSub: subscription({ limited_companion_traffic_limit_gb: 0 }) });

  expect(screen.getByText(/12\.5 \/ ∞/)).toBeTruthy();
});

it('кнопка синхронизации дёргает обработчик родителя', () => {
  const onSyncLimitedCompanion = vi.fn(() => Promise.resolve());
  renderTab({ onSyncLimitedCompanion });

  fireEvent.click(screen.getByText('Синхронизировать'));

  expect(onSyncLimitedCompanion).toHaveBeenCalledTimes(1);
});

it('без компаньона блока нет вовсе', () => {
  renderTab({ selectedSub: subscription({ has_limited_companion: false }) });

  expect(screen.queryByText('Лимитный профиль')).toBeNull();
});

it('без права users:subscription кнопка синхронизации скрыта, но цифры видны', () => {
  renderTab({ hasPermission: (perm: string) => perm !== 'users:subscription' });

  expect(screen.getByText('Лимитный профиль')).toBeTruthy();
  expect(screen.queryByText('Синхронизировать')).toBeNull();
});
