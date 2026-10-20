import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { displayName } from '../utils/displayName';
import { useBlockingStore } from '../store/blocking';
import { subscriptionApi } from '../api/subscription';
import { balanceApi } from '../api/balance';
import { wheelApi } from '../api/wheel';
import Onboarding, { useOnboarding } from '../components/Onboarding';
import PromoOffersSection from '../components/PromoOffersSection';
import NewsSection from '../components/news/NewsSection';
import HomeSubscriptionPanel from '../components/dashboard/HomeSubscriptionPanel';
import SubscriptionCardExpired from '../components/dashboard/SubscriptionCardExpired';
import { hasLegacySubscription } from '../utils/legacySubscription';
import TrialOfferCard from '../components/dashboard/TrialOfferCard';
import ReminderCards from '../components/dashboard/ReminderCards';
import { giftApi } from '../api/gift';
import { promoApi } from '../api/promo';
import PendingGiftCard from '../components/dashboard/PendingGiftCard';
import SubscriptionListCard from '../components/subscription/SubscriptionListCard';
import { DeviceLimitSheet } from '../components/subscription/DeviceLimitSheet';
import { API } from '../config/constants';
import { CardIcon, ChevronRightIcon, StarIcon } from '@/components/icons';
import { useCurrency } from '../hooks/useCurrency';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { safeLocal } from '../utils/safeStorage';
import { getApiErrorMessage } from '../utils/api-error';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const queryClient = useQueryClient();
  const { isCompleted: isOnboardingCompleted, complete: completeOnboarding } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const blockingType = useBlockingStore((state) => state.blockingType);
  const [trialError, setTrialError] = useState<string | null>(null);

  // Refresh user data on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Fetch balance from API
  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  // Multi-tariff: check if user has multiple subscriptions
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const { data: subscriptionResponse, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(),
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
    enabled: !isMultiTariff,
  });

  const subscription = subscriptionResponse?.subscription ?? null;

  const { data: trialInfo, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: !subscription && !subLoading,
  });

  // Плитка «Подключить устройство» на главной живёт в МУЛЬТИТАРИФНОЙ ветке, а
  // запрос выше там выключен: он привязан к одиночной подписке (`subscription`
  // в мультитарифе всегда null). Без отдельного запроса счётчик плитки всегда
  // показывал бы «0 из N», а лимит устройств не срабатывал бы никогда — то
  // есть ровно то, ради чего плитку и добавили, не работало бы.
  // Ключ ['devices', id] — тот же, что на странице подписки, так что кэш общий.
  // Карточки подписок на главной показывают, сколько устройств подключено, и
  // дают подключить ещё. Число устройств живёт в панели, поэтому запрос идёт
  // на каждую показанную подписку; ключ ['devices', id] тот же, что на
  // странице подписки, так что кэш общий и переход туда не стоит сети.
  const visibleSubscriptions = useMemo(
    () => multiSubData?.subscriptions?.slice(0, 3) ?? [],
    [multiSubData],
  );

  const deviceQueries = useQueries({
    queries: visibleSubscriptions.map((sub) => ({
      queryKey: ['devices', sub.id],
      queryFn: () => subscriptionApi.getDevices(sub.id),
      staleTime: API.BALANCE_STALE_TIME_MS,
    })),
  });

  // Подписка, у которой разбираем исчерпанный лимит устройств.
  const [deviceLimitSubId, setDeviceLimitSubId] = useState<number | null>(null);
  const deviceLimitSub = visibleSubscriptions.find((s) => s.id === deviceLimitSubId) ?? null;
  const deviceLimitDevices =
    deviceQueries[visibleSubscriptions.findIndex((s) => s.id === deviceLimitSubId)]?.data;

  const { data: wheelConfig } = useQuery({
    queryKey: ['wheel-config'],
    queryFn: wheelApi.getConfig,
    staleTime: 60000,
    retry: false,
  });

  const { data: pendingGifts } = useQuery({
    queryKey: ['pending-gifts'],
    queryFn: giftApi.getPendingGifts,
    staleTime: 30_000,
    retry: false,
  });

  const { data: promoGroupData } = useQuery({
    queryKey: ['promo-group-discounts'],
    queryFn: promoApi.getGroupDiscounts,
    staleTime: 60_000,
    retry: false,
  });

  const activateTrialMutation = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
      refreshUser();
    },
    onError: (error: unknown) => {
      setTrialError(getApiErrorMessage(error, t('common.error')));
    },
  });

  // Traffic refresh state and mutation
  const [trafficRefreshCooldown, setTrafficRefreshCooldown] = useState(0);
  const [trafficData, setTrafficData] = useState<{
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
  } | null>(null);

  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscription?.id),
    onSuccess: (data) => {
      setTrafficData({
        traffic_used_gb: data.traffic_used_gb,
        traffic_used_percent: data.traffic_used_percent,
        is_unlimited: data.is_unlimited,
      });
      safeLocal.setItem(
        `traffic_refresh_ts_${subscription?.id ?? 'default'}`,
        Date.now().toString(),
      );
      if (data.rate_limited && data.retry_after_seconds) {
        setTrafficRefreshCooldown(data.retry_after_seconds);
      } else {
        setTrafficRefreshCooldown(30);
      }
      queryClient.invalidateQueries({ queryKey: ['subscription', subscription?.id] });
    },
    onError: (error: {
      response?: { status?: number; headers?: { get?: (key: string) => string } };
    }) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.get?.('Retry-After');
        setTrafficRefreshCooldown(retryAfter ? parseInt(retryAfter, 10) : 30);
      }
    },
  });

  // Cooldown timer
  useEffect(() => {
    if (trafficRefreshCooldown <= 0) return;
    const timer = setInterval(() => {
      setTrafficRefreshCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [trafficRefreshCooldown]);

  // Auto-refresh traffic on mount (with 30s caching)
  const hasAutoRefreshed = useRef(false);

  useEffect(() => {
    if (!subscription) return;
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;

    const lastRefresh = safeLocal.getItem(`traffic_refresh_ts_${subscription?.id ?? 'default'}`);
    const now = Date.now();
    const cacheMs = API.TRAFFIC_CACHE_MS;

    if (lastRefresh && now - parseInt(lastRefresh, 10) < cacheMs) {
      const elapsed = now - parseInt(lastRefresh, 10);
      const remaining = Math.ceil((cacheMs - elapsed) / 1000);
      if (remaining > 0) {
        setTrafficRefreshCooldown(remaining);
      }
      return;
    }

    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation]);

  // В multi-tariff /cabinet/subscription отключён, поэтому subscriptionResponse=undefined.
  // Используем список из /cabinet/subscriptions/list — пустой массив означает «нет подписок»,
  // и тогда показываем TrialOfferCard. Без этой ветки multi-tariff юзер никогда не видел триал.
  const hasNoSubscription = isMultiTariff
    ? multiSubData !== undefined && (multiSubData.subscriptions?.length ?? 0) === 0
    : subscriptionResponse?.has_subscription === false && !subLoading;

  // Есть ли НАСТОЯЩАЯ (платная, не триал) живая подписка — от этого зависит CTA:
  // «+ Купить ещё» только при наличии платной; иначе явная «Посмотреть тарифы».
  const hasActivePaid = (multiSubData?.subscriptions ?? []).some(
    (s) => !s.is_trial && (s.status === 'active' || s.status === 'limited'),
  );
  // Старая подписка (без тарифа при включённых тарифах) в списке: «купить ещё»
  // не предлагаем, её карточка ведёт на переход на тариф.
  const hasLegacy = hasLegacySubscription(multiSubData?.subscriptions);

  // Show onboarding for new users after data loads
  useEffect(() => {
    if (!isOnboardingCompleted && !subLoading && !blockingType) {
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isOnboardingCompleted, subLoading, blockingType]);

  const onboardingSteps = useMemo(() => {
    type Placement = 'top' | 'bottom' | 'left' | 'right';
    const steps: Array<{
      target: string;
      title: string;
      description: string;
      placement: Placement;
    }> = [
      {
        target: 'welcome',
        title: t('onboarding.steps.welcome.title'),
        description: t('onboarding.steps.welcome.description'),
        placement: 'bottom',
      },
      {
        target: 'balance',
        title: t('onboarding.steps.balance.title'),
        description: t('onboarding.steps.balance.description'),
        placement: 'bottom',
      },
    ];

    if (subscription?.subscription_url) {
      steps.splice(1, 0, {
        target: 'connect-devices',
        title: t('onboarding.steps.connectDevices.title'),
        description: t('onboarding.steps.connectDevices.description'),
        placement: 'bottom',
      });
    }

    return steps;
  }, [t, subscription]);

  const handleOnboardingComplete = () => {
    completeOnboarding();
    setShowOnboarding(false);
  };

  const userName = displayName(user);
  const { formatAmount, currencySymbol } = useCurrency();

  return (
    <div className="space-y-6">
      {/* Header: приветствие и баланс */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0" data-onboarding="welcome">
          {/* Приветствие мелко, имя крупно: в одну строку рядом с плиткой баланса
              имя не помещалось и обрезалось многоточием. Группа — справа от имени. */}
          {userName && (
            <p className="text-sm text-dark-400">
              {t('dashboard.home.greeting', 'Добро пожаловать')}
            </p>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 break-words text-2xl font-bold leading-tight text-dark-50 sm:text-3xl">
              {userName || t('dashboard.welcomeNoName')}
            </h1>
            {promoGroupData?.group_name && (
              <span
                className="inline-flex max-w-[160px] items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{
                  background: 'rgba(var(--color-accent-400), 0.1)',
                  border: '1px solid rgba(var(--color-accent-400), 0.2)',
                  color: 'rgb(var(--color-accent-400))',
                }}
              >
                <StarIcon filled className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{promoGroupData.group_name}</span>
              </span>
            )}
          </div>
        </div>
        <Link
          to="/balance"
          data-onboarding="balance"
          className="bento-card-hover flex shrink-0 items-center gap-2.5 whitespace-nowrap !rounded-[18px] !p-2.5 !pr-3"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[11px] text-accent-400"
            style={{ background: 'rgba(var(--color-accent-400), 0.12)' }}
          >
            <CardIcon className="h-[18px] w-[18px]" />
          </span>
          <span>
            <span className="block text-[11px] font-semibold text-dark-400">
              {t('dashboard.stats.balance')}
            </span>
            <span className="block text-base font-extrabold text-accent-400">
              {`${formatAmount(balanceData?.balance_rubles ?? 0)}\u00A0${currencySymbol}`}
            </span>
          </span>
          <ChevronRightIcon className="h-4 w-4 text-dark-500" />
        </Link>
      </div>

      {/* Pending Gift Activations */}
      {pendingGifts && pendingGifts.length > 0 && <PendingGiftCard gifts={pendingGifts} />}

      {/* Multi-tariff: show subscription cards (max 3) — только когда подписки
          реально есть. Пустой случай (нет подписок) ведёт блок ниже (триал/покупка),
          иначе кнопка покупки дублировалась. */}
      {isMultiTariff && multiSubData?.subscriptions && multiSubData.subscriptions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-medium text-dark-400">
              {t('dashboard.subscriptions', 'Подписки')}
            </span>
            <Link to="/subscriptions" className="text-xs text-accent-400 hover:underline">
              {t('dashboard.manageAll', 'Управление')} →
            </Link>
          </div>
          {visibleSubscriptions.map((sub, index) => (
            <SubscriptionListCard
              key={sub.id}
              subscription={sub}
              onClick={() => navigate(`/subscriptions/${sub.id}`)}
              connect={{
                connectedDevices: deviceQueries[index]?.data?.total,
                onConnect: () => navigate(`/connection?sub=${sub.id}`),
                onManage: () => setDeviceLimitSubId(sub.id),
              }}
            />
          ))}
          {multiSubData.subscriptions.length > 3 && (
            <Link
              to="/subscriptions"
              className="flex w-full items-center justify-center rounded-2xl border border-dashed border-white/15 p-3 text-xs opacity-50 transition-opacity hover:opacity-80"
            >
              {t('dashboard.showAll', 'Показать все')} ({multiSubData.subscriptions.length})
            </Link>
          )}
          {hasLegacy ? null : hasActivePaid ? (
            <Link
              to="/subscription/purchase"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500/15 p-3.5 text-sm font-medium text-accent-400 transition-all hover:bg-accent-500/25"
            >
              <span className="text-base">+</span>{' '}
              {t('subscriptions.buyAnother', 'Купить ещё тариф')}
            </Link>
          ) : (
            <Link
              to="/subscription/purchase"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 p-3.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-600"
            >
              <span className="text-base">+</span>{' '}
              {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
            </Link>
          )}
        </div>
      )}

      {/* Subscription Status Card — hidden in multi-tariff (managed via /subscriptions) */}
      {!isMultiTariff &&
        (subLoading ? (
          <SkeletonGroup className="bento-card">
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="mb-3 h-10 w-32" />
            <Skeleton className="mb-3 h-4 w-40" />
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="mt-5">
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </SkeletonGroup>
        ) : subscription?.is_expired ||
          subscription?.status === 'disabled' ||
          subscription?.is_limited ? (
          <SubscriptionCardExpired
            subscription={subscription}
            balanceKopeks={balanceData?.balance_kopeks ?? 0}
            balanceRubles={balanceData?.balance_rubles ?? 0}
          />
        ) : subscription ? (
          <HomeSubscriptionPanel subscription={subscription} trafficData={trafficData} />
        ) : null)}

      {/* Вкладки «Подписка» больше нет: у истёкшей или ограниченной подписки
          управление (устройства, перевыпуск, докупка) — по ссылке под карточкой. */}
      {!isMultiTariff &&
        subscription &&
        (subscription.is_expired ||
          subscription.status === 'disabled' ||
          subscription.is_limited) && (
          <Link
            to="/subscriptions"
            className="flex items-center justify-center gap-1 text-sm font-medium text-accent-400 hover:underline"
          >
            {t('lite.rows.manage', 'Управление подпиской')}
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        )}

      {/* Нет подписок: показываем триал (если доступен) и ВСЕГДА одну явную
          кнопку покупки. Триал не обязателен, чтобы попасть в витрину — раньше
          при доступном триале это был единственный экран без кнопки покупки
          (Telegram-баг #605056/#605063). Единственная кнопка тут (вместо дубля
          с мульти-тариф блоком). */}
      {hasNoSubscription && !trialLoading && (
        <div className="space-y-3">
          {trialInfo?.is_available && (
            <TrialOfferCard
              trialInfo={trialInfo}
              balanceKopeks={balanceData?.balance_kopeks || 0}
              balanceRubles={balanceData?.balance_rubles || 0}
              activateTrialMutation={activateTrialMutation}
              trialError={trialError}
            />
          )}
          <Link
            to="/subscription/purchase"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 p-3.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-600"
          >
            <span className="text-base">+</span>{' '}
            {t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
          </Link>
        </div>
      )}

      {/* Promo Offers */}
      <PromoOffersSection />

      {/* Fortune Wheel Banner */}
      {wheelConfig?.is_enabled && (
        <Link to="/wheel" className="bento-card-hover group flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-3xl">🎰</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-dark-100">{t('wheel.banner.title')}</h3>
              <p className="text-sm text-dark-400">{t('wheel.banner.description')}</p>
            </div>
          </div>
          <div className="flex-shrink-0 text-dark-500 transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent-400">
            <ChevronRightIcon />
          </div>
        </Link>
      )}

      {/* Напоминания (админка → Напоминания) */}
      <ReminderCards />

      {/* News Section */}
      <NewsSection />

      {/* Onboarding Tutorial */}
      {showOnboarding && (
        <Onboarding
          steps={onboardingSteps}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingComplete}
        />
      )}

      {deviceLimitSub && (
        <DeviceLimitSheet
          isOpen
          onClose={() => setDeviceLimitSubId(null)}
          subscriptionId={deviceLimitSub.id}
          subscriptionName={deviceLimitSub.tariff_name || t('subscription.defaultName', 'Подписка')}
          deviceLimit={deviceLimitSub.device_limit}
          isTrial={deviceLimitSub.is_trial}
          devices={deviceLimitDevices?.devices ?? []}
          onOpenSubscription={() => {
            setDeviceLimitSubId(null);
            navigate(`/subscriptions/${deviceLimitSub.id}`);
          }}
        />
      )}
    </div>
  );
}
