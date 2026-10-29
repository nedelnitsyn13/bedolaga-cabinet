import apiClient from './client';

/**
 * Подписанная ссылка прокси медиа — через тот же API-адрес, что и сам запрос.
 * Бот строит её от своего публичного адреса, а кабинет может ходить к API
 * через другой (относительный /api, свой домен); токен в query сохраняем.
 * Не ссылка на прокси или не разобралась — отдаём как есть: картинку не
 * загрузит <img>, и сработает его запасной вариант.
 */
export function toMediaProxyUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://cabinet.example');
    const mediaPath = parsed.pathname.match(/(?:^|\/)cabinet\/media\/[^/]+$/)?.[0];
    if (mediaPath) {
      return apiClient.getUri({
        url: `${mediaPath.startsWith('/') ? '' : '/'}${mediaPath}${parsed.search}`,
      });
    }
  } catch {
    // Невалидная ссылка: разберётся onError картинки.
  }
  return url;
}
