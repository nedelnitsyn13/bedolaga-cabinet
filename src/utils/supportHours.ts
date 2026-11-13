/**
 * Часы работы поддержки и «когда ответят» — чистые функции для экрана поддержки.
 *
 * Время ответа считает бот (медиана первого ответа за 30 дней в рабочих минутах);
 * здесь только подача: «~25 мин» / «~1,5 ч», подпись пояса и сколько осталось.
 */

export interface SupportStatus {
  hours_enabled: boolean;
  open_now: boolean;
  start_hour: number;
  end_hour: number;
  timezone: string;
  reply_minutes: number;
  opens_at: string | null;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Как в боте: до часа — кратно 5 минутам, до трёх часов — получасам, дальше — часам. */
export function roundEstimate(minutes: number): number {
  const value = Math.max(5, minutes);
  if (value <= 60) return Math.ceil(value / 5) * 5;
  if (value < 180) return Math.round(value / 30) * 30;
  return Math.round(value / 60) * 60;
}

/** «~25 мин» / «~1,5 ч»; ``plain`` — без «~», для «Среднее время ответа — 15 мин». */
export function formatEta(
  minutes: number,
  t: Translate,
  locale: string,
  { plain = false }: { plain?: boolean } = {},
): string {
  if (minutes < 60) {
    return t(plain ? 'support.hours.minutesPlain' : 'support.hours.minutes', { count: minutes });
  }
  const value = (minutes / 60).toLocaleString(locale, { maximumFractionDigits: 1 });
  return t(plain ? 'support.hours.hoursPlain' : 'support.hours.hoursShort', { value });
}

export function hourLabel(hour: number): string {
  return `${String(hour === 24 ? 24 : hour % 24).padStart(2, '0')}:00`;
}

/** «МСК» для Москвы, иначе смещение вида «GMT+5» — в часовом поясе бота, а не браузера. */
export function timezoneLabel(timezone: string, t: Translate, locale: string): string {
  if (timezone === 'Europe/Moscow') return t('support.hours.msk');
  try {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date())
      .find((item) => item.type === 'timeZoneName');
    return part?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/** Сколько минут осталось до ожидаемого ответа (округлено); null — срок уже прошёл. */
export function minutesUntil(expectedAt: string, now: number = Date.now()): number | null {
  const left = (new Date(expectedAt).getTime() - now) / 60_000;
  return left > 0 ? roundEstimate(left) : null;
}
