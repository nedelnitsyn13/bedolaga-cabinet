// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { useChatAutoScroll } from './useChatAutoScroll';

/**
 * Открытый тикет показывал первое сообщение вместо последнего. Проверяем
 * правила: новый тикет — вниз; новое сообщение — вниз, только если человек
 * был внизу; читающего старые сообщения не дёргаем.
 */

beforeAll(() => {
  // jsdom не считает раскладку: высота ленты 1000, окна 300.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 300,
  });
});
afterEach(cleanup);

function Chat({ ticket, count }: { ticket: number; count: number }) {
  const { containerRef, onScroll } = useChatAutoScroll(ticket, count);
  return (
    <div ref={containerRef} onScroll={onScroll} data-testid="chat">
      {Array.from({ length: count }, (_, i) => (
        <p key={i}>message {i}</p>
      ))}
    </div>
  );
}

it('открытый тикет сразу показывает последнее сообщение', () => {
  const { getByTestId } = render(<Chat ticket={1} count={5} />);
  expect(getByTestId('chat').scrollTop).toBe(1000);
});

it('новое сообщение прокручивает вниз, если человек был внизу', () => {
  const { getByTestId, rerender } = render(<Chat ticket={1} count={5} />);
  const chat = getByTestId('chat');
  chat.scrollTop = 700;
  fireEvent.scroll(chat);

  rerender(<Chat ticket={1} count={6} />);
  expect(chat.scrollTop).toBe(1000);
});

it('читающего старые сообщения новое сообщение не дёргает', () => {
  const { getByTestId, rerender } = render(<Chat ticket={1} count={5} />);
  const chat = getByTestId('chat');
  chat.scrollTop = 100;
  fireEvent.scroll(chat);

  rerender(<Chat ticket={1} count={6} />);
  expect(chat.scrollTop).toBe(100);
});

it('другой тикет снова открывается на последнем сообщении', () => {
  const { getByTestId, rerender } = render(<Chat ticket={1} count={5} />);
  const chat = getByTestId('chat');
  chat.scrollTop = 100;
  fireEvent.scroll(chat);

  rerender(<Chat ticket={2} count={3} />);
  expect(chat.scrollTop).toBe(1000);
});
