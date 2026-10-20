import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ticketsApi } from '../../api/tickets';

const RATINGS = [1, 2, 3, 4, 5] as const;

export function CsatStars({ rating, className = '' }: { rating: number; className?: string }) {
  return (
    <span className={`whitespace-nowrap ${className}`} aria-label={`${rating}/5`}>
      {'★'.repeat(rating)}
      <span className="opacity-30">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

interface TicketCsatProps {
  ticketId: number;
  rating: number | null | undefined;
}

/** Оценка поддержки в закрытом тикете, начатом в кабинете. */
export function TicketCsat({ ticketId, rating }: TicketCsatProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(0);

  const rate = useMutation({
    mutationFn: (value: number) => ticketsApi.rateTicket(ticketId, value),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  if (rating) {
    return (
      <div className="border-t border-dark-800/50 py-4 text-center text-sm text-dark-300">
        {t('support.csat.thanks')} <CsatStars rating={rating} className="text-warning-400" />
      </div>
    );
  }

  return (
    <div className="border-t border-dark-800/50 py-4 text-center">
      <div className="mb-2 text-sm text-dark-300">{t('support.csat.prompt')}</div>
      <div className="flex justify-center gap-1" onMouseLeave={() => setHovered(0)}>
        {RATINGS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={rate.isPending}
            onClick={() => rate.mutate(value)}
            onMouseEnter={() => setHovered(value)}
            aria-label={t('support.csat.rate', { rating: value })}
            className={`text-3xl leading-none transition-colors disabled:opacity-50 ${
              value <= hovered ? 'text-warning-400' : 'text-dark-600'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      {rate.isError && (
        <div className="mt-2 text-sm text-error-400">{t('support.csat.failed')}</div>
      )}
    </div>
  );
}
