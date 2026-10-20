// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * Два одинаковых «SM-A235F» отличаются только приложением и временем
 * последнего обновления подписки — карточка показывает и то, и другое,
 * а «с даты» берёт из первого подключения, а не из последнего обновления.
 */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);
vi.mock('@/platform/hooks/useNativeDialog', () => ({ useDestructiveConfirm: () => vi.fn() }));

import { PlatformProvider } from '@/platform/PlatformProvider';
import { DevicesCard, type DeviceRow } from './DevicesCard';

const device = (extra: Partial<DeviceRow>): DeviceRow => ({
  hwid: 'hwid-1',
  platform: 'Android',
  device_model: 'SM-A235F',
  created_at: '2026-10-20T08:00:00Z',
  ...extra,
});

function open(devices: DeviceRow[]) {
  render(
    <PlatformProvider>
      <DevicesCard
        devices={devices}
        loading={false}
        limit={2}
        busy={false}
        canManage={false}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onResetAll={vi.fn()}
      />
    </PlatformProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

it('показывает приложение, ОС, первое подключение и последнее обновление', () => {
  open([
    device({
      app_name: 'Happ',
      os_version: '14',
      user_agent: 'Happ/2.0.5/Android',
      first_seen_at: '2026-10-19T08:00:00Z',
      last_seen_at: '2026-10-20T08:00:00Z',
    }),
  ]);

  const subtitle = screen.getByText(/Happ/);
  expect(subtitle.textContent).toBe(
    'Happ · Android 14 · с 19.10.2026 · обновлял подписку 2 ч назад',
  );
  expect(subtitle.closest('li')?.getAttribute('title')).toBe('hwid-1\nHapp/2.0.5/Android');
});

it('старый бэкенд без новых полей: без ложной даты «с»', () => {
  open([device({})]);

  expect(screen.getByText('Android').textContent).toBe('Android');
});
