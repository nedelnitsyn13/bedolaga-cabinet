import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ru from '@/locales/ru.json';
import { deviceUpdatedLabel } from './deviceUpdated';

/** Клиент видит одной строкой, когда подписку обновили и в каком приложении. */

function t(key: string, options: Record<string, unknown> = {}): string {
  const path = key.split('.');
  const count = options.count as number | undefined;
  const resolve = (k: string[]) =>
    k.reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], ru);
  let value = resolve(path);
  if (typeof value !== 'string' && count !== undefined) {
    const form = count === 1 ? 'one' : count < 5 ? 'few' : 'many';
    value = resolve([...path.slice(0, -1), `${path[path.length - 1]}_${form}`]);
  }
  return String(value).replace(/{{(\w+)}}/g, (_, name) => String(options[name]));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

it('приложение и время', () => {
  expect(
    deviceUpdatedLabel(
      { platform: 'Android', app_name: 'Happ', last_seen_at: '2026-10-20T08:00:00Z' },
      t,
    ),
  ).toBe('Обновлено в Happ 2 ч назад');
});

it('приложение не определилось — только время', () => {
  expect(deviceUpdatedLabel({ platform: 'Android', last_seen_at: '2026-10-20T09:59:50Z' }, t)).toBe(
    'Обновлено только что',
  );
});

it('старый бэкенд без времени — приложение или платформа', () => {
  expect(deviceUpdatedLabel({ platform: 'Android', app_name: 'INCY' }, t)).toBe('INCY');
  expect(deviceUpdatedLabel({ platform: 'Android' }, t)).toBe('Android');
});
