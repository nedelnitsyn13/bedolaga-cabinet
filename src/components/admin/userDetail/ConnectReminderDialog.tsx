import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { adminUsersApi, type ConnectReminderInfo } from '@/api/adminUsers';
import { dayTimeLabel } from '@/components/admin/users';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useNotify } from '@/platform/hooks/useNotify';

interface ConnectReminderDialogProps {
  userId: number;
  info: ConnectReminderInfo;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

const MAX_LENGTH = 4096;

/**
 * «Напомнить подключиться» из шапки карточки: триал взят, подключения не было.
 * Текст — тот же, что у автонапоминания панели, его можно поправить; кнопку
 * «Подключиться» бот добавит сам. Если уже напоминали за последние сутки —
 * говорим об этом прямо в окне, чтобы не написать человеку дважды подряд.
 */
export function ConnectReminderDialog({
  userId,
  info,
  open,
  onClose,
  onSent,
}: ConnectReminderDialogProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const [text, setText] = useState(info.text);
  const [sending, setSending] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(open, { onEscape: () => !sending && onClose() });

  // Каждое открытие — с готового текста: правка прошлого раза не должна уйти следующему.
  useEffect(() => {
    if (open) setText(info.text);
  }, [open, info.text]);

  if (!open) return null;

  const recent =
    info.last_sent_at !== null &&
    Date.now() - new Date(info.last_sent_at).getTime() < info.cooldown_hours * 3_600_000;

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const { result } = await adminUsersApi.sendConnectReminder(userId, trimmed);
      if (result === 'sent') {
        notify.success(t('admin.users.connectReminder.sent'), t('common.success'));
        onSent();
        onClose();
      } else {
        notify.error(t(`admin.users.connectReminder.${result}`), t('common.error'));
        // Попытка записана в журнал и на сервере — обновим карточку и в этом случае.
        onSent();
      }
    } catch {
      notify.error(t('admin.users.userActions.error'), t('common.error'));
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 bg-dark-950/60"
        onClick={() => !sending && onClose()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-reminder-title"
        className="relative w-full max-w-md rounded-2xl border border-dark-700 bg-dark-800 p-5"
      >
        <h2 id="connect-reminder-title" className="mb-2 text-lg font-semibold text-dark-100">
          {t('admin.users.connectReminder.title')}
        </h2>
        <p className="mb-3 text-sm text-dark-400">{t('admin.users.connectReminder.hint')}</p>
        {recent && (
          <p className="mb-3 rounded-xl bg-warning-500/10 px-3 py-2 text-sm text-warning-400">
            {t('admin.users.connectReminder.lastSent', {
              when: dayTimeLabel(info.last_sent_at, t),
            })}
          </p>
        )}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_LENGTH}
          rows={6}
          aria-label={t('admin.users.connectReminder.title')}
          className="input resize-y"
        />
        <div className="mt-1 text-right text-xs text-dark-500">
          {text.length}/{MAX_LENGTH}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={sending} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="btn-primary"
          >
            {sending
              ? t('admin.users.connectReminder.sending')
              : t('admin.users.connectReminder.send')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
