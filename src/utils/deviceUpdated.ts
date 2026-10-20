import { relativeLabel } from '@/components/admin/users/RelativeTime';
import { relativeTimeParts } from './relativeTime';

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface DeviceActivity {
  platform: string;
  app_name?: string | null;
  last_seen_at?: string | null;
}

/**
 * Строка под устройством у клиента: «Обновлено в Happ 2 ч назад».
 * Панель обновляет время устройства при каждом запросе подписки, а приложение
 * узнаёт по User-Agent. Без времени — приложение или платформа.
 */
export function deviceUpdatedLabel(device: DeviceActivity, t: Translate): string {
  if (!device.last_seen_at) return device.app_name || device.platform;
  const when = relativeLabel(relativeTimeParts(device.last_seen_at), t);
  return device.app_name
    ? t('subscription.deviceUpdatedIn', { app: device.app_name, when })
    : t('subscription.deviceUpdated', { when });
}
