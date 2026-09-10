// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PlatformProvider } from '@/platform/PlatformProvider';
import { afterEach, expect, it, vi } from 'vitest';
import type { ServerInfo, TariffDetail } from '@/api/tariffs';

/**
 * Свой лимит трафика на сервер тарифа (server_traffic_limits) — то же, что уже
 * умеет телеграм-редактор тарифа в боте, но в кабинете формы для этого не было
 * вовсе (только тип в API, ни одного места использования в форме тарифа).
 *
 * Пустое поле — «общий лимит тарифа», не 0 ГБ: докупка так же интерпретирует
 * отсутствие ключа в server_traffic_limits.
 */

import ruLocale from '@/locales/ru.json';

function resolveRu(key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ruLocale);
  return typeof value === 'string' ? value : undefined;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (resolveRu(key) ?? key).replace(/{{(\w+)}}/g, (_m, name) => String(options?.[name] ?? '')),
    i18n: { language: 'ru', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children?: unknown }) => children ?? null,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const servers: ServerInfo[] = [
  {
    id: 1,
    squad_uuid: 'squad-osnova',
    display_name: 'osnova',
    country_code: 'NL',
    is_selected: false,
    traffic_limit_gb: null,
  },
  {
    id: 2,
    squad_uuid: 'squad-bs',
    display_name: 'BS',
    country_code: 'DE',
    is_selected: false,
    traffic_limit_gb: null,
  },
];

const stored: Partial<TariffDetail> = {
  id: 9,
  name: 'Стандарт',
  description: '',
  is_active: true,
  is_highlighted: false,
  is_daily: false,
  traffic_limit_gb: 100,
  device_limit: 5,
  device_price_kopeks: 0,
  max_device_limit: 0,
  tier_level: 2,
  period_prices: [{ days: 30, price_kopeks: 29000 }],
  highlight_period_days: null,
  allowed_squads: ['squad-bs'],
  server_traffic_limits: { 'squad-bs': { traffic_limit_gb: 250 } },
  external_squad_uuid: null,
  promo_groups: [],
  daily_price_kopeks: 0,
  lava_product_id: null,
  traffic_topup_enabled: false,
  max_topup_traffic_gb: 0,
  traffic_topup_packages: {},
  traffic_reset_mode: null,
  show_in_gift: true,
};

const created: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];

vi.mock('@/api/tariffs', () => ({
  tariffsApi: {
    getAvailableServers: () => Promise.resolve(servers),
    getAvailableExternalSquads: () => Promise.resolve([]),
    getAvailablePromoGroups: () => Promise.resolve([]),
    getTariff: () => Promise.resolve(stored),
    createTariff: (payload: Record<string, unknown>) => {
      created.push(payload);
      return Promise.resolve({ id: 1 });
    },
    updateTariff: (_id: number, payload: Record<string, unknown>) => {
      updated.push(payload);
      return Promise.resolve(stored);
    },
  },
}));

import AdminTariffCreate from './AdminTariffCreate';

afterEach(() => {
  created.length = 0;
  updated.length = 0;
  cleanup();
});

function renderCreatePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PlatformProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AdminTariffCreate />
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

function renderEditPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PlatformProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/tariffs/9/edit']}>
          <Routes>
            <Route path="/admin/tariffs/:id/edit" element={<AdminTariffCreate />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

function priceInput(): HTMLInputElement {
  const label = screen.getAllByText(resolveRu('admin.tariffs.priceLabel') as string)[0];
  return label.parentElement!.querySelector('input') as HTMLInputElement;
}

function daysInput(): HTMLInputElement {
  const label = screen.getByText(resolveRu('admin.tariffs.daysLabel') as string);
  return label.parentElement!.querySelector('input') as HTMLInputElement;
}

async function addPeriod(days: string) {
  fireEvent.click(await screen.findByText(resolveRu('admin.tariffs.tabPeriods') as string));
  fireEvent.change(daysInput(), { target: { value: days } });
  fireEvent.change(priceInput(), { target: { value: '399' } });
  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.addButton') as string));
  await screen.findByText(`${days} ${resolveRu('admin.tariffs.daysShort')}`);
}

async function openServersTab() {
  fireEvent.click(await screen.findByText(resolveRu('admin.tariffs.tabServers') as string));
  await screen.findByText(resolveRu('admin.tariffs.serversTabHint') as string);
}

/** Инпут лимита живёт в строке сервера рядом с кнопкой выбора — null, если сервер не выбран. */
function limitInput(serverName: string): HTMLInputElement | null {
  const label = screen.getByText(serverName);
  const row = label.closest('button')!.parentElement as HTMLElement;
  return row.querySelector('input[type="number"]');
}

async function save(name: string): Promise<Record<string, unknown>> {
  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.tabBasic') as string));
  fireEvent.change(document.getElementById('tariff-name') as HTMLInputElement, {
    target: { value: name },
  });
  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.saveButton') as string));
  await waitFor(() => expect(created.length).toBe(1));
  return created[0];
}

it('поле лимита появляется только у выбранного сервера', async () => {
  renderCreatePage();
  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.periodTariff') as string));
  await addPeriod('30');
  await openServersTab();

  expect(limitInput('osnova')).toBeNull();

  fireEvent.click(screen.getByText('osnova'));
  expect(limitInput('osnova')).not.toBeNull();
});

it('введённый лимит уходит в server_traffic_limits при создании', async () => {
  renderCreatePage();
  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.periodTariff') as string));
  await addPeriod('30');
  await openServersTab();
  fireEvent.click(screen.getByText('BS'));
  fireEvent.change(limitInput('BS') as HTMLInputElement, { target: { value: '250' } });

  const payload = await save('Премиум');

  expect(payload.server_traffic_limits).toEqual({ 'squad-bs': { traffic_limit_gb: 250 } });
});

it('пустой лимит — сервер выбран, но override не уходит (общий лимит тарифа)', async () => {
  renderCreatePage();
  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.periodTariff') as string));
  await addPeriod('30');
  await openServersTab();
  fireEvent.click(screen.getByText('osnova'));

  const payload = await save('Базовый');

  expect(payload.allowed_squads).toEqual(['squad-osnova']);
  expect(payload.server_traffic_limits).toEqual({});
});

it('на правке лимит подтягивается из server_traffic_limits тарифа', async () => {
  renderEditPage();
  await openServersTab();

  expect((limitInput('BS') as HTMLInputElement).value).toBe('250');
});

it('на правке сохранение без изменений везёт сохранённый лимит', async () => {
  renderEditPage();
  await openServersTab();

  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.tabBasic') as string));
  fireEvent.click(screen.getByText(resolveRu('admin.tariffs.saveButton') as string));

  await waitFor(() => expect(updated.length).toBe(1));
  expect(updated[0].server_traffic_limits).toEqual({ 'squad-bs': { traffic_limit_gb: 250 } });
});
