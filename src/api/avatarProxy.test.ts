import { describe, expect, it, vi } from 'vitest';
const { get, post, getUri } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getUri: vi.fn(({ url }: { url: string }) => `/api${url}`),
}));
vi.mock('./client', () => ({ default: { get, post, getUri } }));
import { adminUsersApi } from './adminUsers';
import { authApi } from './auth';
describe('avatar API proxy', () => {
  it('keeps the signed token and uses the same API base as the avatar request', async () => {
    get.mockResolvedValue({
      data: { photo_url: 'https://cabinet.example/cabinet/media/masked-file?token=masked-token' },
    });
    expect((await authApi.getMyAvatar()).photo_url).toBe(
      '/api/cabinet/media/masked-file?token=masked-token',
    );
  });
  it('leaves an absent avatar absent', async () => {
    get.mockResolvedValue({ data: { photo_url: null } });
    expect((await authApi.getMyAvatar()).photo_url).toBeNull();
  });
  it('maps the admin list photos through the same proxy, keyed by numeric user id', async () => {
    post.mockResolvedValue({
      data: { avatars: { '7': 'https://bot.example/cabinet/media/file-7?token=t7' } },
    });
    expect(await adminUsersApi.getAvatars([7, 8])).toEqual({
      7: '/api/cabinet/media/file-7?token=t7',
    });
    expect(post).toHaveBeenCalledWith('/cabinet/admin/users/avatars', { user_ids: [7, 8] });
  });
});
