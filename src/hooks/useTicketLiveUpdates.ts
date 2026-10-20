import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket, type WSMessage } from './useWebSocket';

/**
 * События тикетов, после которых страница перечитывает данные.
 * `ticket.updated` бэкенд шлёт на любое изменение тикета из любого места
 * (бот, кабинет, Web API) — без него ответ из Telegram появлялся только
 * после перезагрузки страницы.
 */
const TICKET_EVENTS = new Set([
  'ticket.updated',
  'ticket.new',
  'ticket.user_reply',
  'ticket.admin_reply',
  'ticket.csat_requested',
]);

/** Запасной опрос, если WebSocket недоступен (прокси, мобильная сеть). */
export const TICKET_POLL_INTERVAL_MS = 20_000;

export function useTicketLiveUpdates(scope: 'admin' | 'user') {
  const queryClient = useQueryClient();

  const onMessage = useCallback(
    (message: WSMessage) => {
      if (!TICKET_EVENTS.has(message.type)) return;
      const [list, detail, extra] =
        scope === 'admin'
          ? ['admin-tickets', 'admin-ticket', 'admin-ticket-stats']
          : ['tickets', 'ticket', null];
      queryClient.invalidateQueries({ queryKey: [list] });
      queryClient.invalidateQueries({
        queryKey: message.ticket_id ? [detail, message.ticket_id] : [detail],
      });
      if (extra) queryClient.invalidateQueries({ queryKey: [extra] });
    },
    [scope, queryClient],
  );

  useWebSocket({ onMessage });
}
