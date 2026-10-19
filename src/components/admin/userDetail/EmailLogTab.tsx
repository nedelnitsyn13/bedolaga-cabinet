import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminUserEmailApi, type EmailLogItem } from '@/api/adminUserEmail';
import { stampParts } from '@/components/admin/users';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PAGE = 50;
const MAX = 200;

const STATUS_TONE: Record<string, string> = {
  sent: 'bg-success-500/15 text-success-400',
  queued: 'bg-warning-500/15 text-warning-400',
  failed: 'bg-error-500/15 text-error-400',
};

function EmailLogRow({ item, currentEmail }: { item: EmailLogItem; currentEmail: string | null }) {
  const { t } = useTranslation();
  const ns = 'admin.users.detail.emailLog';
  const stamp = stampParts(item.created_at);
  const typeLabel = t(`${ns}.types.${item.email_type}`, { defaultValue: item.email_type });
  const statusLabel = t(`${ns}.status.${item.status}`, { defaultValue: item.status });
  // Адрес показываем, только если письмо ушло не на текущую почту (её сменили).
  const otherAddress =
    currentEmail && item.to_email.toLowerCase() !== currentEmail.toLowerCase()
      ? item.to_email
      : null;

  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-dark-100">
          {item.subject}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            STATUS_TONE[item.status] ?? 'bg-dark-800 text-dark-400',
          )}
        >
          {statusLabel}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-dark-500">
        <span className="tabular-nums">
          {stamp.day} {stamp.time}
        </span>
        <span>· {typeLabel}</span>
        {otherAddress && <span className="[overflow-wrap:anywhere]">· {otherAddress}</span>}
      </div>
      {item.error && (
        <p className="m-0 text-xs text-error-400 [overflow-wrap:anywhere]">{item.error}</p>
      )}
    </li>
  );
}

/** Журнал писем пользователя: что, когда и с каким результатом уходило на почту. */
export function EmailLogTab({
  userId,
  currentEmail,
}: {
  userId: number;
  currentEmail: string | null;
}) {
  const { t } = useTranslation();
  const ns = 'admin.users.detail.emailLog';
  const [limit, setLimit] = useState(PAGE);
  const query = useQuery({
    queryKey: ['admin-user-emails', userId, limit] as const,
    queryFn: () => adminUserEmailApi.getEmailLog(userId, limit),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) {
    return (
      <SkeletonGroup className="space-y-2">
        <Skeleton variant="line" count={3} className="h-12" />
      </SkeletonGroup>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-dark-500">{t(`${ns}.loadError`)}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="btn-secondary px-3 py-2 text-sm"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const { items, total, retention_days: retentionDays } = query.data;
  const retention = (
    <p className="text-xs text-dark-500">{t(`${ns}.retention`, { days: retentionDays })}</p>
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-dark-500">{t(`${ns}.empty`)}</p>
        {retention}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 list-none divide-y divide-dark-800/80 p-0">
        {items.map((item) => (
          <EmailLogRow key={item.id} item={item} currentEmail={currentEmail} />
        ))}
      </ul>
      {items.length < total && limit < MAX && (
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => setLimit((current) => Math.min(current + PAGE, MAX))}
          className="btn-secondary self-start px-3 py-2 text-sm"
        >
          {t(`${ns}.more`)}
        </button>
      )}
      {retention}
    </div>
  );
}
