// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UserAvatar } from './UserAvatar';

/** Фото Telegram в списке пользователей: есть — поверх буквы, сломалось — снова буква. */

afterEach(cleanup);

describe('UserAvatar', () => {
  it('без фото — только буква', () => {
    const { container } = render(<UserAvatar firstName="лекс" username={null} />);
    expect(container.textContent).toBe('Л');
    expect(container.querySelector('img')).toBeNull();
  });

  it('фото поверх буквы, а битое фото убирается', () => {
    const { container } = render(
      <UserAvatar firstName="Сергей" username="uonac" photoUrl="/api/cabinet/media/x?token=t" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/api/cabinet/media/x?token=t');
    expect(container.textContent).toBe('С');

    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
  });

  it('новая ссылка после ошибки пробуется снова', () => {
    const { container, rerender } = render(
      <UserAvatar firstName="A" username={null} photoUrl="/old" />,
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    rerender(<UserAvatar firstName="A" username={null} photoUrl="/new" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/new');
  });
});
