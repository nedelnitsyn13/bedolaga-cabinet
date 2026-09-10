import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionApi } from '../../../api/subscription';
import { getErrorMessage } from '../../../utils/subscriptionHelpers';
import InsufficientBalancePrompt from '../../InsufficientBalancePrompt';
import { ChevronRightIcon } from '../../icons';
import type { LimitedCompanionTraffic, PurchaseOptions } from '../../../types';

// ──────────────────────────────────────────────────────────────────
// Buy-traffic sheet for the limited-companion server's own traffic pool.
// Mirrors TrafficTopupSheet's structure/styling, adapted for the
// companion account: no warning note (top-up isn't time-limited the
// same way), flat monthly pricing, and the current limit comes from the
// parent's limited-traffic query rather than the main Subscription object.
// ──────────────────────────────────────────────────────────────────

export interface LimitedTrafficTopupSheetProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  subscriptionId: number | undefined;
  limitedTraffic: LimitedCompanionTraffic | undefined;
  selectedTrafficPackage: number | null;
  onSelectedTrafficPackageChange: (gb: number | null) => void;
  purchaseOptions: PurchaseOptions | undefined;
  isDark: boolean;
}

export function LimitedTrafficTopupSheet({
  open,
  onOpen,
  onClose,
  subscriptionId,
  limitedTraffic,
  selectedTrafficPackage,
  onSelectedTrafficPackageChange,
  purchaseOptions,
  isDark,
}: LimitedTrafficTopupSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const formatPrice = (kopeks: number) => {
    const rubles = kopeks / 100;
    return rubles % 1 === 0 ? `${rubles} ₽` : `${rubles.toFixed(2)} ₽`;
  };

  const { data: trafficPackages } = useQuery({
    queryKey: ['limited-traffic-packages', subscriptionId],
    queryFn: () => subscriptionApi.getLimitedTrafficPackages(subscriptionId),
    enabled: open && !!limitedTraffic?.available,
  });

  const purchaseMutation = useMutation({
    mutationFn: (gb: number) => subscriptionApi.purchaseLimitedTraffic(gb, subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['limited-traffic', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['limited-traffic-packages', subscriptionId] });
      onClose();
      onSelectedTrafficPackageChange(null);
    },
  });

  if (!limitedTraffic?.available) {
    return null;
  }

  if (!open) {
    return (
      <button
        onClick={onOpen}
        className={`w-full rounded-xl border p-4 text-left transition-colors ${isDark ? 'border-dark-700/50 bg-dark-800/50 hover:border-dark-600' : 'border-champagne-300/60 bg-champagne-200/40 hover:border-champagne-400'}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-dark-100">
              {t('subscription.additionalOptions.buyTrafficLimited')}
            </div>
            <div className="mt-1 text-sm text-dark-400">
              {t('subscription.additionalOptions.currentTrafficLimitedLimit', {
                limit: limitedTraffic.total_limit_gb,
              })}
            </div>
          </div>
          <ChevronRightIcon className="text-dark-400" />
        </div>
      </button>
    );
  }

  return (
    <div
      className={`rounded-xl border p-5 ${isDark ? 'border-dark-700/50 bg-dark-800/50' : 'border-champagne-300/60 bg-champagne-200/40'}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-dark-100">
          {t('subscription.additionalOptions.buyTrafficLimitedTitle')}
        </h3>
        <button
          onClick={() => {
            onClose();
            onSelectedTrafficPackageChange(null);
          }}
          className="text-sm text-dark-400 hover:text-dark-200"
          aria-label={t('common.close', 'Close')}
        >
          ✕
        </button>
      </div>

      {!trafficPackages || trafficPackages.length === 0 ? (
        <div className="py-4 text-center text-sm text-dark-400">
          {t('subscription.additionalOptions.trafficLimitedUnavailable')}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {trafficPackages.map((pkg) => (
              <button
                key={pkg.gb}
                onClick={() => onSelectedTrafficPackageChange(pkg.gb)}
                className={`rounded-xl border p-4 text-center transition-all ${
                  selectedTrafficPackage === pkg.gb
                    ? 'border-accent-500 bg-accent-500/10'
                    : isDark
                      ? 'border-dark-700/50 bg-dark-800/50 hover:border-dark-600'
                      : 'border-champagne-300/60 bg-champagne-200/40 hover:border-champagne-400'
                }`}
              >
                <div className="text-lg font-semibold text-dark-100">
                  {`${pkg.gb} ${t('common.units.gb')}`}
                </div>
                {pkg.discount_percent && pkg.discount_percent > 0 && (
                  <div className="mb-1">
                    <span className="inline-block rounded-full bg-success-500/20 px-2 py-0.5 text-xs font-medium text-success-400">
                      -{pkg.discount_percent}%
                    </span>
                  </div>
                )}
                <div className="font-medium text-accent-400">
                  {pkg.discount_percent && pkg.discount_percent > 0 && pkg.base_price_kopeks ? (
                    <>
                      <span className="mr-1 text-sm text-dark-500 line-through">
                        {formatPrice(pkg.base_price_kopeks)}
                      </span>
                      {formatPrice(pkg.price_kopeks)}
                    </>
                  ) : (
                    formatPrice(pkg.price_kopeks)
                  )}
                </div>
              </button>
            ))}
          </div>

          {selectedTrafficPackage !== null &&
            (() => {
              const selectedPkg = trafficPackages.find((p) => p.gb === selectedTrafficPackage);
              const hasEnoughBalance =
                !selectedPkg ||
                !purchaseOptions ||
                selectedPkg.price_kopeks <= purchaseOptions.balance_kopeks;
              const missingAmount =
                selectedPkg && purchaseOptions
                  ? selectedPkg.price_kopeks - purchaseOptions.balance_kopeks
                  : 0;

              return (
                <>
                  {!hasEnoughBalance && missingAmount > 0 && (
                    <InsufficientBalancePrompt
                      missingAmountKopeks={missingAmount}
                      compact
                      className="mb-3"
                      onBeforeTopUp={async () => {
                        await subscriptionApi.saveLimitedTrafficCart(
                          selectedTrafficPackage,
                          subscriptionId,
                        );
                      }}
                    />
                  )}
                  <button
                    onClick={() => purchaseMutation.mutate(selectedTrafficPackage)}
                    disabled={purchaseMutation.isPending || !hasEnoughBalance}
                    className="btn-primary w-full py-3"
                  >
                    {purchaseMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      </span>
                    ) : (
                      t('subscription.additionalOptions.buyTrafficGb', {
                        gb: selectedTrafficPackage,
                      })
                    )}
                  </button>
                </>
              );
            })()}

          {purchaseMutation.isError && (
            <div className="text-center text-sm text-error-400">
              {getErrorMessage(purchaseMutation.error)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
