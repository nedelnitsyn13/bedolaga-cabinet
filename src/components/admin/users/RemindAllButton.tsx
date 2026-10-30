import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { adminUsersApi } from '@/api/adminUsers';
import { BellIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useNativeDialog } from '@/platform/hooks/useNativeDialog';
import { useNotify } from '@/platform/hooks/useNotify';

/**
 * «Напомнить всем» в выборке «Триал без подключения».
 *
 * Кому писать, считает бот, а не лента: загружена лишь первая порция, а
 * напоминание нужно всем подходящим. Перед отправкой — честное число и сколько
 * пропустим, потому что им уже писали недавно; сама отправка идёт фоном.
 */
export function RemindAllButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { confirm } = useNativeDialog();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const audience = await adminUsersApi.getConnectReminderAudience();
      if (audience.count === 0) {
        notify.info(
          t('admin.users.connectReminder.bulkNobody', { hours: audience.cooldown_hours }),
        );
        return;
      }
      const ok = await confirm(
        t('admin.users.connectReminder.bulkConfirm', {
          count: audience.count,
          skipped: audience.skipped_recent,
          hours: audience.cooldown_hours,
        }),
        t('admin.users.connectReminder.bulkConfirmTitle'),
      );
      if (!ok) return;
      const { queued } = await adminUsersApi.sendConnectReminderBulk();
      notify.success(
        t('admin.users.connectReminder.bulkStarted', { count: queued }),
        t('common.success'),
      );
    } catch (error) {
      notify.error(
        isAxiosError(error) && error.response?.status === 503
          ? t('admin.users.connectReminder.panelUnavailable')
          : t('admin.users.userActions.error'),
        t('common.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={cn(
        'btn-secondary h-9 shrink-0 gap-1.5 px-3 text-sm disabled:cursor-wait',
        className,
      )}
    >
      <BellIcon className="h-4 w-4" />
      {t('admin.users.connectReminder.bulkButton')}
    </button>
  );
}
