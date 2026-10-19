import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth';
import { getApiErrorMessage } from '../utils/api-error';
import LanguageSwitcher from '../components/LanguageSwitcher';

/**
 * Ссылка из письма «почту указал администратор». В отличие от /verify-email в аккаунт
 * не входит: адрес вводил не владелец, и при опечатке письмо получил бы посторонний.
 * Человек подтверждает почту и дальше входит обычным способом.
 */
export default function ConfirmEmail() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Токен одноразовый: повторный запрос (StrictMode, ре-рендер) показал бы ошибку.
    if (started.current) return;
    started.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setError(t('emailConfirmation.noToken'));
      return;
    }

    authApi
      .confirmAdminSetEmail(token)
      .then((response) => {
        setEmail(response.email);
        setStatus('success');
      })
      .catch((err: unknown) => {
        // Ответы бота английские — человеку показываем понятную причину.
        const detail = getApiErrorMessage(err, '');
        setStatus('error');
        setError(
          /expired/i.test(detail)
            ? t('emailConfirmation.expired')
            : /invalid/i.test(detail)
              ? t('emailConfirmation.invalid')
              : t('emailConfirmation.tryLater'),
        );
      });
  }, [searchParams, t]);

  return (
    <div className="min-h-viewport flex items-center justify-center bg-dark-950 px-4 py-8 sm:py-12">
      <div className="fixed right-4 top-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md text-center">
        {status === 'loading' && (
          <div role="status">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <h1 className="text-lg font-semibold text-dark-50 sm:text-xl">
              {t('emailConfirmation.confirming')}
            </h1>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div aria-hidden="true" className="mb-4 text-5xl text-success-500 sm:text-6xl">
              ✓
            </div>
            <h1 className="text-lg font-semibold text-dark-50 sm:text-xl">
              {t('emailConfirmation.success')}
            </h1>
            <p className="mt-2 text-sm text-dark-400 [overflow-wrap:anywhere] sm:text-base">
              {t('emailConfirmation.successMessage', { email })}
            </p>
            <div className="mt-6">
              <Link to="/login" className="btn-primary">
                {t('emailConfirmation.goToLogin')}
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div aria-hidden="true" className="mb-4 text-5xl text-error-500 sm:text-6xl">
              ✗
            </div>
            <h1 className="text-lg font-semibold text-dark-50 sm:text-xl">
              {t('emailConfirmation.failed')}
            </h1>
            <p className="mt-2 text-sm text-dark-400 sm:text-base">{error}</p>
            <p className="mt-2 text-sm text-dark-500">{t('emailConfirmation.askSupport')}</p>
            <div className="mt-6">
              <Link to="/login" className="btn-secondary">
                {t('emailConfirmation.goToLogin')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
