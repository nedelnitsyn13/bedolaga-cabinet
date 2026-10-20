import { uiLocale } from '@/utils/uiLocale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { subscriptionApi } from '@/api/subscription';
import {
  ArrowPathIcon,
  CheckIcon,
  CopyIcon,
  DevicesIcon,
  AdjustmentsIcon,
  SubscriptionIcon,
} from '@/components/icons';
import { useHaptic } from '@/platform';
import { useTheme } from '@/hooks/useTheme';
import { useTrafficZone } from '@/hooks/useTrafficZone';
import { useCloseOnSuccessNotification } from '@/store/successNotification';
import type { Subscription } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import { resolveConnectionUrlForUi } from '@/utils/connectionLink';
import { formatTraffic } from '@/utils/formatTraffic';
import { getGlassColors } from '@/utils/glassTheme';
import { planTitle, showsAddonOptions, showsAutopayToggle } from '@/utils/legacySubscription';
import { safeLocal } from '@/utils/safeStorage';

import { purchaseCtaPath } from '../subscription/PurchaseCTAButton';
import { useAutopayMutation } from '../subscription/manage/AutopayToggle';
import { DailyPausePanel } from '../subscription/manage/DailyPausePanel';
import { DevicesPanel } from '../subscription/manage/DevicesPanel';
import { RecurringPanels } from '../subscription/manage/RecurringPanels';
import { ReissueLinkButton, canReissueLink } from '../subscription/manage/ReissueLinkButton';
import { DeviceReductionSheet } from '../subscription/sheets/DeviceReductionSheet';
import { DeviceTopupSheet } from '../subscription/sheets/DeviceTopupSheet';
import { LimitedTrafficTopupSheet } from '../subscription/sheets/LimitedTrafficTopupSheet';
import { ServerManagementSheet } from '../subscription/sheets/ServerManagementSheet';
import { TrafficTopupSheet } from '../subscription/sheets/TrafficTopupSheet';
import TrafficProgressBar from './TrafficProgressBar';

const LIMITED_REFRESH_CACHE_MS = 30_000;

const TILE_CLASS =
  'flex h-16 w-full items-center gap-3 rounded-[18px] px-3.5 text-left text-sm font-semibold leading-tight text-dark-50 transition-colors';

interface HomeSubscriptionPanelProps {
  subscription: Subscription;
  /** Свежий трафик основной подписки (главная обновляет его сама). */
  trafficData: {
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
  } | null;
}

/**
 * Подписка на главной: всё, что раньше жило на вкладке «Подписка».
 *
 * Сверху срок и лимитный сервер, ниже ссылка с кнопкой «Подключить», четыре
 * плитки действий и устройства. Полоса основного трафика показывается только
 * у тарифов с лимитом: у безлимитных она ничего не сообщала. Докупка устройств
 * и трафика раскрывается под плиткой «Устройства и трафик» — теми же листами,
 * что на странице подписки.
 */
export default function HomeSubscriptionPanel({
  subscription,
  trafficData,
}: HomeSubscriptionPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const { isDark } = useTheme();
  const g = getGlassColors(isDark);
  // Одиночная подписка живёт под ключами без id, как и на старой странице.
  const subscriptionId: number | undefined = undefined;

  const usedPercent = trafficData?.traffic_used_percent ?? subscription.traffic_used_percent;
  const usedGb = trafficData?.traffic_used_gb ?? subscription.traffic_used_gb;
  const isUnlimited = (trafficData?.is_unlimited ?? false) || subscription.traffic_limit_gb === 0;
  const zone = useTrafficZone(usedPercent);

  const { data: devicesData } = useQuery({
    queryKey: ['devices', subscriptionId],
    queryFn: () => subscriptionApi.getDevices(subscriptionId),
  });
  const connectedDevices = devicesData?.total ?? 0;
  const isAtDeviceLimit =
    subscription.device_limit > 0 && connectedDevices >= subscription.device_limit;

  const { data: connectionLink, isLoading: linkLoading } = useQuery({
    queryKey: ['connection-link', subscriptionId],
    queryFn: () => subscriptionApi.getConnectionLink(subscriptionId),
    retry: false,
  });
  const connectionUrl = useMemo(
    () =>
      resolveConnectionUrlForUi({
        mode: connectionLink?.connect_mode,
        happSchemeLink: connectionLink?.happ_scheme_link,
        displayLink: connectionLink?.display_link,
        subscriptionUrl: connectionLink?.subscription_url,
        happCryptLink: connectionLink?.happ_cryptolink,
        happCryptoLink: connectionLink?.happ_crypto_link,
        happLink: connectionLink?.happ_link,
        fallbackUrl: linkLoading ? null : (subscription.subscription_url ?? null),
      }),
    [connectionLink, linkLoading, subscription.subscription_url],
  );
  const hideLink = subscription.hide_subscription_link || connectionLink?.hide_link;

  const [copied, setCopied] = useState(false);
  const copyUrl = () => {
    if (!connectionUrl) return;
    void copyToClipboard(connectionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Трафик лимитного сервера: отдельный пул; бэкенд пишет его редко, поэтому,
  // как и страница подписки, при открытии один раз просим свежие цифры.
  const { data: limitedTraffic } = useQuery({
    queryKey: ['limited-traffic', subscriptionId],
    queryFn: () => subscriptionApi.getLimitedTraffic(subscriptionId),
  });
  const refreshLimited = useMutation({
    mutationFn: () => subscriptionApi.refreshLimitedTraffic(subscriptionId),
    onSuccess: (data) => {
      queryClient.setQueryData(['limited-traffic', subscriptionId], data);
      safeLocal.setItem('limited_traffic_refresh_ts_default', Date.now().toString());
    },
  });
  const limitedRefreshed = useRef(false);
  useEffect(() => {
    if (!limitedTraffic?.available || limitedRefreshed.current) return;
    limitedRefreshed.current = true;
    const last = Number(safeLocal.getItem('limited_traffic_refresh_ts_default') || '0');
    if (Date.now() - last < LIMITED_REFRESH_CACHE_MS) return;
    refreshLimited.mutate();
  }, [limitedTraffic?.available, refreshLimited]);

  const autopay = useAutopayMutation(subscriptionId);
  const hasAddons = showsAddonOptions(subscription);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Листы докупки — те же, что на странице подписки.
  const { data: purchaseOptions } = useQuery({
    queryKey: ['purchase-options', subscriptionId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subscriptionId),
    enabled: optionsOpen,
  });
  const [showDeviceTopup, setShowDeviceTopup] = useState(false);
  const [devicesToAdd, setDevicesToAdd] = useState(1);
  const [showDeviceReduction, setShowDeviceReduction] = useState(false);
  const [targetDeviceLimit, setTargetDeviceLimit] = useState(1);
  const [showTrafficTopup, setShowTrafficTopup] = useState(false);
  const [trafficPackage, setTrafficPackage] = useState<number | null>(null);
  const [showLimitedTopup, setShowLimitedTopup] = useState(false);
  const [limitedPackage, setLimitedPackage] = useState<number | null>(null);
  const [showServers, setShowServers] = useState(false);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const closeSheets = useCallback(() => {
    setShowDeviceTopup(false);
    setShowDeviceReduction(false);
    setShowTrafficTopup(false);
    setShowLimitedTopup(false);
    setShowServers(false);
  }, []);
  useCloseOnSuccessNotification(closeSheets);

  const endDate = new Date(subscription.end_date).toLocaleDateString(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const remaining =
    subscription.days_left > 0
      ? { value: String(subscription.days_left), unit: t('subscription.daysShort') }
      : { value: `${subscription.hours_left}`, unit: t('subscription.hours') };

  const tileStyle = { background: g.cardBg, border: `1px solid ${g.cardBorder}` };
  const iconStyle = { background: 'rgba(var(--color-accent-400), 0.12)' };

  return (
    <div className="space-y-3">
      {/* Срок и лимитный сервер */}
      <section
        className="rounded-3xl p-5"
        style={{
          background:
            'linear-gradient(180deg, rgba(var(--color-accent-400), 0.09) 0%, rgba(var(--color-accent-400), 0) 100%), ' +
            g.cardBg,
          border: '1px solid rgba(var(--color-accent-400), 0.16)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-base font-bold text-dark-50">
            {planTitle(subscription, t)}
          </h2>
          <span
            className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: zone.mainHex }}
          >
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: zone.mainHex }} />
            {subscription.is_trial
              ? t('subscription.trialStatus')
              : isUnlimited
                ? t('dashboard.unlimited')
                : t(zone.labelKey)}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[52px] font-extrabold leading-[0.95] tracking-tight text-dark-50">
              {remaining.value}
              <span className="ml-1.5 text-base font-medium text-dark-400">{remaining.unit}</span>
            </div>
            <div className="mt-1.5 text-sm text-dark-400">
              {t('dashboard.home.left', 'осталось')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-dark-400">
              {t('subscription.expiresAt')}
            </div>
            <div className="mt-1.5 font-mono text-[15px] text-dark-50">{endDate}</div>
          </div>
        </div>

        {limitedTraffic?.available ? (
          <div
            className="mt-5 rounded-2xl p-3.5"
            style={{ background: g.innerBg, border: `1px solid ${g.innerBorder}` }}
          >
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-400">
                {t('subscription.limitedServerTraffic')}
              </span>
              <span className="font-mono text-[13px] text-dark-50">
                {`${formatTraffic(limitedTraffic.used_gb)} / ${formatTraffic(limitedTraffic.total_limit_gb)}`}
              </span>
            </div>
            <TrafficProgressBar
              usedGb={limitedTraffic.used_gb}
              limitGb={limitedTraffic.total_limit_gb}
              percent={limitedTraffic.used_percent}
              isUnlimited={false}
              compact
            />
          </div>
        ) : !isUnlimited ? (
          <div
            className="mt-5 rounded-2xl p-3.5"
            style={{ background: g.innerBg, border: `1px solid ${g.innerBorder}` }}
          >
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-dark-400">
                {t('subscription.traffic')}
              </span>
              <span className="font-mono text-[13px] text-dark-50">
                {`${formatTraffic(usedGb)} / ${formatTraffic(subscription.traffic_limit_gb)}`}
              </span>
            </div>
            <TrafficProgressBar
              usedGb={usedGb}
              limitGb={subscription.traffic_limit_gb}
              percent={usedPercent}
              isUnlimited={false}
              compact
            />
          </div>
        ) : null}
      </section>

      {/* Ссылка и подключение */}
      {subscription.subscription_url && (
        <section
          className="space-y-3 rounded-3xl p-4"
          style={{ background: g.cardBg, border: '1px solid rgba(var(--color-accent-400), 0.22)' }}
          data-onboarding="connect-devices"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-bold text-dark-50">
              {t('dashboard.home.linkTitle', 'Ссылка подписки')}
            </span>
            <span className="text-[13px] text-dark-400">
              {subscription.device_limit === 0
                ? t('dashboard.devicesConnectedUnlimited', { used: connectedDevices })
                : t('dashboard.devicesOfMax', {
                    used: connectedDevices,
                    max: subscription.device_limit,
                  })}
            </span>
          </div>

          {connectionUrl && !hideLink && (
            <div
              className="flex h-12 items-center gap-2 rounded-[14px] pl-3.5 pr-1.5"
              style={{ background: g.codeBg, border: `1px solid ${g.codeBorder}` }}
            >
              <code
                className="min-w-0 flex-1 truncate font-mono text-[13px] text-dark-300"
                title={connectionUrl}
              >
                {connectionUrl}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-accent-400 transition-colors"
                style={iconStyle}
                aria-label={t('subscription.copyLink')}
                title={t('subscription.copyLink')}
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (isAtDeviceLimit) {
                haptic.notification('error');
                if (hasAddons) setOptionsOpen(true);
                return;
              }
              navigate('/connection');
            }}
            aria-disabled={isAtDeviceLimit}
            className={`flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-accent-500 text-[15px] font-bold text-on-accent transition-colors hover:bg-accent-600 ${isAtDeviceLimit ? 'opacity-60' : ''}`}
          >
            <DevicesIcon className="h-[18px] w-[18px]" />
            {t('dashboard.connectDevice')}
          </button>
          {isAtDeviceLimit && (
            <p className="text-center text-xs text-warning-400">
              {t('dashboard.deviceLimitReached')}
            </p>
          )}
        </section>
      )}

      {/* Действия */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link to={purchaseCtaPath(subscription)} className={TILE_CLASS} style={tileStyle}>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-accent-400"
            style={iconStyle}
          >
            <SubscriptionIcon className="h-[18px] w-[18px]" />
          </span>
          {subscription.is_trial
            ? t('dashboard.home.upgrade', 'Купить тариф')
            : t('dashboard.home.renew', 'Продлить')}
        </Link>

        {hasAddons && (
          <button
            type="button"
            onClick={() => setOptionsOpen((open) => !open)}
            aria-expanded={optionsOpen}
            className={TILE_CLASS}
            style={
              optionsOpen
                ? { ...tileStyle, border: '1px solid rgba(var(--color-accent-400), 0.35)' }
                : tileStyle
            }
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-accent-400"
              style={iconStyle}
            >
              <AdjustmentsIcon className="h-[18px] w-[18px]" />
            </span>
            {t('dashboard.home.devicesAndTraffic', 'Устройства и трафик')}
          </button>
        )}

        {showsAutopayToggle(subscription) && (
          <button
            type="button"
            role="switch"
            aria-checked={subscription.autopay_enabled}
            onClick={() => autopay.mutate(!subscription.autopay_enabled)}
            disabled={autopay.isPending}
            className={TILE_CLASS}
            style={tileStyle}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-accent-400"
              style={iconStyle}
            >
              <ArrowPathIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              {t('subscription.autoRenewal')}
              <span
                className={`mt-0.5 block text-xs font-medium ${subscription.autopay_enabled ? 'text-accent-400' : 'text-dark-400'}`}
              >
                {subscription.autopay_enabled
                  ? t('dashboard.home.autopayOn', 'Включено')
                  : t('dashboard.home.autopayOff', 'Выключено')}
              </span>
            </span>
          </button>
        )}

        {canReissueLink(subscription) && (
          <ReissueLinkButton
            subscription={subscription}
            subscriptionId={subscriptionId}
            variant="tile"
          />
        )}
      </div>

      {/* Устройства и трафик: докупка, уменьшение, сервера */}
      {hasAddons && optionsOpen && (
        <section
          className="space-y-4 rounded-3xl p-5"
          style={{ background: g.cardBg, border: `1px solid ${g.cardBorder}` }}
        >
          <DeviceTopupSheet
            open={showDeviceTopup}
            onOpen={() => setShowDeviceTopup(true)}
            onClose={() => setShowDeviceTopup(false)}
            subscription={subscription}
            subscriptionId={subscriptionId}
            devicesToAdd={devicesToAdd}
            onDevicesToAddChange={setDevicesToAdd}
            purchaseOptions={purchaseOptions}
            isDark={isDark}
          />
          <DeviceReductionSheet
            open={showDeviceReduction}
            onOpen={() => setShowDeviceReduction(true)}
            onClose={() => setShowDeviceReduction(false)}
            subscriptionPresent
            subscriptionId={subscriptionId}
            targetDeviceLimit={targetDeviceLimit}
            onTargetDeviceLimitChange={setTargetDeviceLimit}
            isDark={isDark}
          />
          {subscription.traffic_limit_gb > 0 && (
            <TrafficTopupSheet
              open={showTrafficTopup}
              onOpen={() => setShowTrafficTopup(true)}
              onClose={() => setShowTrafficTopup(false)}
              subscription={subscription}
              subscriptionId={subscriptionId}
              selectedTrafficPackage={trafficPackage}
              onSelectedTrafficPackageChange={setTrafficPackage}
              purchaseOptions={purchaseOptions}
              isDark={isDark}
            />
          )}
          {limitedTraffic?.available && (
            <LimitedTrafficTopupSheet
              open={showLimitedTopup}
              onOpen={() => setShowLimitedTopup(true)}
              onClose={() => setShowLimitedTopup(false)}
              subscriptionId={subscriptionId}
              limitedTraffic={limitedTraffic}
              selectedTrafficPackage={limitedPackage}
              onSelectedTrafficPackageChange={setLimitedPackage}
              purchaseOptions={purchaseOptions}
              isDark={isDark}
            />
          )}
          {purchaseOptions && purchaseOptions.sales_mode !== 'tariffs' && (
            <ServerManagementSheet
              open={showServers}
              onOpen={() => setShowServers(true)}
              onClose={() => setShowServers(false)}
              subscription={subscription}
              subscriptionId={subscriptionId}
              selectedServers={selectedServers}
              onSelectedServersChange={setSelectedServers}
              purchaseOptions={purchaseOptions}
              isDark={isDark}
            />
          )}
        </section>
      )}

      {subscription.is_daily && !subscription.is_trial && (
        <section
          className="rounded-3xl p-5"
          style={{ background: g.cardBg, border: `1px solid ${g.cardBorder}` }}
        >
          <DailyPausePanel subscription={subscription} subscriptionId={subscriptionId} />
        </section>
      )}

      <RecurringPanels subscription={subscription} subscriptionId={subscriptionId} />

      <section
        className="rounded-3xl p-5"
        style={{ background: g.cardBg, border: `1px solid ${g.cardBorder}` }}
      >
        <DevicesPanel subscription={subscription} subscriptionId={subscriptionId} />
      </section>
    </div>
  );
}
