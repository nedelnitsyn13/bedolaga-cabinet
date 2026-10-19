import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { adminUserEmailApi, type AdminUserEmailState } from '@/api/adminUserEmail';
import type { UserDetailResponse } from '@/api/adminUsers';
import { EmailIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useDestructiveConfirm } from '@/platform/hooks/useNativeDialog';
import { KeyValues, LinkAction, Section } from './sectionParts';
import { useAdminAction } from './useAdminAction';

interface EmailSectionProps {
  user: UserDetailResponse;
  /** Право `users:edit`: указать, удалить, отправить ссылку ещё раз. */
  canEdit: boolean;
  className?: string;
  /** Перечитать карточку после изменения почты. */
  onChanged: () => Promise<unknown> | unknown;
  /** Открыть журнал писем («Активность → Письма»). */
  onShowLog: () => void;
}

/** Простая проверка формы адреса; окончательно адрес проверяет бот. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Почта пользователя. Админ указывает адрес — он сохраняется неподтверждённым, и на
 * него уходит ссылка. Ссылка только подтверждает адрес и в аккаунт не входит: при
 * опечатке письмо получит посторонний, и вход в чужой аккаунт ему не достанется.
 */
export function EmailSection({
  user,
  canEdit,
  className,
  onChanged,
  onShowLog,
}: EmailSectionProps) {
  const { t } = useTranslation();
  const ns = 'admin.users.detail.email';
  const inputId = useId();
  const hintId = useId();
  const queryClient = useQueryClient();
  const { busy, run } = useAdminAction();
  const confirmDestructive = useDestructiveConfirm();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const refresh = async () => {
    await Promise.all([
      onChanged(),
      queryClient.invalidateQueries({ queryKey: ['admin-user-emails', user.id] }),
    ]);
  };

  const sentNotice = (result: AdminUserEmailState) =>
    result.email_sent ? t(`${ns}.linkSent`, { email: result.email }) : '';
  const notSentWarning = (result: AdminUserEmailState) =>
    result.email_sent === false ? t(`${ns}.linkNotSent`) : null;

  const trimmed = value.trim();
  const valid = EMAIL_SHAPE.test(trimmed);

  const save = async () => {
    if (!valid) return;
    const ok = await run(() => adminUserEmailApi.setEmail(user.id, trimmed), {
      success: sentNotice,
      warning: notSentWarning,
      after: refresh,
    });
    if (ok) {
      setEditing(false);
      setValue('');
    }
  };

  const resend = () =>
    run(() => adminUserEmailApi.resendConfirmation(user.id), {
      success: sentNotice,
      warning: notSentWarning,
      after: refresh,
    });

  const remove = async () => {
    const ok = await confirmDestructive(
      t(`${ns}.confirmDelete`, { email: user.email }),
      t('common.delete'),
    );
    if (!ok) return;
    await run(() => adminUserEmailApi.deleteEmail(user.id), {
      success: t(`${ns}.deleted`),
      after: refresh,
    });
  };

  const startEditing = () => {
    setValue(user.email ?? '');
    setEditing(true);
  };

  return (
    <Section
      className={className}
      icon={<EmailIcon className="h-5 w-5" />}
      title={t(`${ns}.title`)}
      action={
        <LinkAction arrow short={t(`${ns}.logShort`)} onClick={onShowLog}>
          {t(`${ns}.log`)}
        </LinkAction>
      }
    >
      <KeyValues
        rows={[
          {
            key: 'address',
            label: t(`${ns}.address`),
            value: user.email ? (
              <span className="[overflow-wrap:anywhere]">{user.email}</span>
            ) : (
              <span className="text-dark-500">{t(`${ns}.none`)}</span>
            ),
          },
          ...(user.email
            ? [
                {
                  key: 'state',
                  label: t(`${ns}.state`),
                  value: (
                    <span
                      className={cn(user.email_verified ? 'text-success-400' : 'text-warning-400')}
                    >
                      {user.email_verified ? t(`${ns}.verified`) : t(`${ns}.unverified`)}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      {canEdit && editing && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={inputId} className="text-xs text-dark-500">
            {t(`${ns}.newAddress`)}
          </label>
          <input
            id={inputId}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="name@example.com"
            aria-describedby={hintId}
            className="input py-2.5"
            maxLength={255}
          />
          <p id={hintId} className="text-xs text-dark-500">
            {t(`${ns}.hint`)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !valid}
              className="btn-primary px-3 py-2 text-sm"
            >
              {t(`${ns}.saveAndSend`)}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="btn-secondary px-3 py-2 text-sm"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {canEdit && !editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={startEditing}
            className="btn-secondary px-3 py-2 text-sm"
          >
            {user.email ? t(`${ns}.change`) : t(`${ns}.set`)}
          </button>
          {user.email && !user.email_verified && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void resend()}
              className="btn-secondary px-3 py-2 text-sm"
            >
              {t(`${ns}.resend`)}
            </button>
          )}
          {user.email && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="btn-secondary px-3 py-2 text-sm text-error-400"
            >
              {t(`${ns}.delete`)}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
