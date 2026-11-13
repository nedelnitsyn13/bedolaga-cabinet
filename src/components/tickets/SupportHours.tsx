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
 * Строка о часах работы на экране поддержки: тикет можно оставить всегда, но
 * человек должен знать, что ночью ответят только утром.
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
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        status.open_now
          ? 'border-dark-700/60 bg-dark-900/40 text-dark-300'
          : 'border-warning-500/30 bg-warning-500/10 text-warning-300',
        className,
      )}
    >
      <div>
        🕙{' '}
        {t('support.hours.line', {
          start: hourLabel(status.start_hour),
          end: hourLabel(status.end_hour),
          tz: timezoneLabel(status.timezone, t, locale),
        })}
      </div>
      {!status.open_now && (
        <div className="mt-1">
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
