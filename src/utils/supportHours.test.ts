import { describe, expect, it } from 'vitest';
import { formatEta, hourLabel, minutesUntil, roundEstimate, timezoneLabel } from './supportHours';

/** «Когда ответят» на экране поддержки: округление как в боте, подпись пояса, остаток. */

const t = (key: string, options?: Record<string, unknown>) =>
  ({
    'support.hours.minutes': `~${options?.count} мин`,
    'support.hours.hoursShort': `~${options?.value} ч`,
    'support.hours.msk': 'МСК',
  })[key] ?? key;

describe('supportHours', () => {
  it('округляет как бот', () => {
    expect(roundEstimate(2)).toBe(5);
    expect(roundEstimate(23)).toBe(25);
    expect(roundEstimate(100)).toBe(90);
    expect(roundEstimate(250)).toBe(240);
  });

  it('минуты и часы по-человечески', () => {
    expect(formatEta(25, t, 'ru-RU')).toBe('~25 мин');
    expect(formatEta(90, t, 'ru-RU')).toBe('~1,5 ч');
    expect(formatEta(120, t, 'ru-RU')).toBe('~2 ч');
  });

  it('часы и пояс бота, а не браузера', () => {
    expect(hourLabel(10)).toBe('10:00');
    expect(hourLabel(24)).toBe('24:00');
    expect(timezoneLabel('Europe/Moscow', t, 'ru-RU')).toBe('МСК');
    expect(timezoneLabel('Asia/Yekaterinburg', t, 'en-US')).toBe('GMT+5');
  });

  it('остаток до ответа; прошедший срок — null', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    expect(minutesUntil('2026-11-02T12:23:00Z', now)).toBe(25);
    expect(minutesUntil('2026-11-02T11:00:00Z', now)).toBeNull();
  });
});
