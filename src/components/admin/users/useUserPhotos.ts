import { useQueries } from '@tanstack/react-query';
import { adminUsersApi } from '@/api/adminUsers';

// Фото профиля меняют редко, а бот кеширует их на час — чаще и спрашивать незачем.
const PHOTOS_STALE_MS = 60 * 60 * 1000;

// Вне хука, чтобы ссылка была постоянной: тогда react-query пересобирает карту
// только при новых ответах, и список не перерисовывается на каждый рендер.
function mergePhotos(results: { data?: Record<number, string> }[]): Record<number, string> {
  return Object.assign({}, ...results.map((result) => result.data ?? {}));
}

/**
 * Фото Telegram для списка: один запрос на порцию ленты, а не на каждого.
 * Порции — те же группы id, что пришли страницей: дозагрузка ленты не
 * перезапрашивает уже показанных, а обновление списка с тем же составом
 * берёт фото из кеша. Пока ответа нет — кружки с буквой.
 */
export function useUserPhotos(groups: readonly (readonly number[])[]): Record<number, string> {
  return useQueries({
    queries: groups
      .filter((ids) => ids.length > 0)
      .map((ids) => {
        const sorted = [...ids].sort((a, b) => a - b);
        return {
          queryKey: ['admin-users-photos', sorted] as const,
          queryFn: () => adminUsersApi.getAvatars(sorted),
          staleTime: PHOTOS_STALE_MS,
          retry: false,
        };
      }),
    combine: mergePhotos,
  });
}
