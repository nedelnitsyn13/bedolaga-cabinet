import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** Насколько можно не дотянуть до низа и всё ещё считаться «внизу», px. */
const NEAR_BOTTOM_PX = 80;

/**
 * Прокрутка переписки к последнему сообщению.
 *
 * Без неё открытый тикет показывал первое сообщение, и последнее приходилось
 * докручивать руками. Правила:
 * - открыли другой тикет (`conversationKey`) — сразу вниз;
 * - пришло новое сообщение — вниз, только если человек и так был внизу:
 *   читающего старые сообщения не дёргаем;
 * - картинки догружаются позже и раздвигают ленту — пока человек внизу,
 *   держим низ (ResizeObserver на сообщениях).
 */
export function useChatAutoScroll(conversationKey: unknown, messageCount: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastKey = useRef<unknown>(undefined);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: число сообщений — триггер: новое сообщение прокручивает вниз
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const switched = lastKey.current !== conversationKey;
    lastKey.current = conversationKey;
    if (switched || nearBottom.current) {
      nearBottom.current = true;
      scrollToBottom();
    }
  }, [conversationKey, messageCount, scrollToBottom]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: тикет и число сообщений — триггер переподписки на новые сообщения
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) scrollToBottom();
    });
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [conversationKey, messageCount, scrollToBottom]);

  return { containerRef, onScroll };
}
