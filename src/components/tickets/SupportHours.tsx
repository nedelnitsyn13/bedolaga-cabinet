import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { uiLocale } from '@/utils/uiLocale';
import {
  type SupportStatus,
  formatEta,
  hourLabel,
  minutesUntil,
  timezoneLabel,
} from '@/utils/supportHours';

/**
 * Плашка о режиме работы на экране поддержки: сразу видно, на связи ли сейчас
 * поддержка и когда она работает. Тикет можно оставить всегда, но ночью человек
 * должен понимать, что ответят только утром.
 */
export function SupportHoursNotice({
  status,
  className,
}: {
  status: SupportStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!status.hours_enabled) return null;
  const locale = uiLocale();
  const allDay = status.start_hour % 24 === status.end_hour % 24;
  const online = status.open_now;
  return (
    <div
      role="status"
      className={cn(
        'rounded-2xl border px-4 py-3',
        online
          ? 'border-success-500/25 bg-success-500/[0.06]'
          : 'border-warning-500/30 bg-warning-500/10',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {online && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-500 opacity-60" />
          )}
          <span
            className={cn(
              'relative inline-flex h-2.5 w-2.5 rounded-full',
              online ? 'bg-success-500' : 'bg-warning-500',
            )}
          />
        </span>
        <span
          className={cn('text-sm font-semibold', online ? 'text-success-400' : 'text-warning-300')}
        >
          {online ? t('support.hours.onlineNow') : t('support.hours.offlineNow')}
        </span>
      </div>
      <div className="mt-1.5 text-sm text-dark-300">
        🕙{' '}
        {allDay
          ? t('support.hours.allDay')
          : t('support.hours.line', {
              start: hourLabel(status.start_hour),
              end: hourLabel(status.end_hour),
              tz: timezoneLabel(status.timezone, t, locale),
            })}
      </div>
      {!online && (
        <div className="mt-1 text-sm text-warning-300">
          {t('support.hours.closedNow', { start: hourLabel(status.start_hour) })}
        </div>
      )}
    </div>
  );
}

/** Подсказка в форме тикета: как быстро обычно отвечаем — или что ответим утром. */
export function TypicalReplyHint({ status }: { status: SupportStatus }) {
  const { t } = useTranslation();
  const locale = uiLocale();
  const eta = formatEta(status.reply_minutes, t, locale);
  return (
    <p className="text-xs text-dark-500">
      ⏱{' '}
      {status.open_now
        ? t('support.hours.typical', {
            eta: formatEta(status.reply_minutes, t, locale, { plain: true }),
          })
        : t('support.hours.etaClosed', {
            start: hourLabel(status.start_hour),
            tz: timezoneLabel(status.timezone, t, locale),
            eta,
          })}
    </p>
  );
}

/** «Ответим примерно через ~N мин» у тикета, который ждёт ответа поддержки. */
export function ExpectedReply({
  expectedAt,
  status,
}: {
  expectedAt: string;
  status: SupportStatus | undefined;
}) {
  const { t } = useTranslation();
  const locale = uiLocale();
  let text: string;
  if (status && !status.open_now) {
    text = t('support.hours.etaClosed', {
      start: hourLabel(status.start_hour),
      tz: timezoneLabel(status.timezone, t, locale),
      eta: formatEta(status.reply_minutes, t, locale),
    });
  } else {
    const left = minutesUntil(expectedAt);
    text =
      left === null
        ? t('support.hours.etaSoon')
        : t('support.hours.etaOpen', { eta: formatEta(left, t, locale) });
  }
  return <p className="text-xs text-dark-400">⏱ {text}</p>;
}
