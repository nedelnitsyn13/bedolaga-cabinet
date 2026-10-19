import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { adminUsersApi } from '@/api/adminUsers';
import { ClockIcon } from '@/components/icons';
import { ActivityTab } from './ActivityTab';
import { EmailLogTab } from './EmailLogTab';
import { GiftsTab } from './GiftsTab';
import { Segmented } from '@/components/admin/Segmented';
import { TicketsTab } from './TicketsTab';
import { Section } from './sectionParts';

/**
 * Один ряд фильтров вместо вложенных вкладок и девяти чипов. «Обращения» и
 * «Подарки» показывают свои подробные списки (переписка, коды подарков),
 * остальные — ленту с набором типов для ручки активности.
 */
const FEED_TYPES = {
  all: null,
  payments: 'transaction,withdrawal,referral_earning',
  subscription: 'event,promocode,coupon',
  actions: 'button_click,cabinet_action,miniapp_action,wheel_spin,poll',
  logins: 'cabinet_login',
} as const;

export type ActivityView = keyof typeof FEED_TYPES | 'tickets' | 'gifts' | 'emails';
export const ACTIVITY_VIEWS: readonly ActivityView[] = [
  'all',
  'payments',
  'subscription',
  'actions',
  'logins',
  'tickets',
  'gifts',
  'emails',
];

/** Старые ссылки `?view=timeline` ведут в «Всё». */
export function pickActivityView(value: string | null): ActivityView {
  if (value === 'timeline') return 'all';
  return value && (ACTIVITY_VIEWS as readonly string[]).includes(value)
    ? (value as ActivityView)
    : 'all';
}

interface ActivityHubProps {
  userId: number;
  view: ActivityView;
  onViewChange: (view: ActivityView) => void;
  onNavigateToUser: (userId: number) => void;
  /** Текущая почта: в журнале писем адрес показывается, только если письмо ушло на другой. */
  currentEmail: string | null;
}

export function ActivityHub({
  userId,
  view,
  onViewChange,
  onNavigateToUser,
  currentEmail,
}: ActivityHubProps) {
  const { t } = useTranslation();
  const ns = 'admin.users.detail.activity';
  const giftsQuery = useQuery({
    queryKey: ['admin-user-gifts', userId] as const,
    queryFn: () => adminUsersApi.getUserGifts(userId),
    enabled: view === 'gifts',
  });
  const filter = (
    <Segmented
      label={t('admin.users.detail.tabs.activity')}
      value={view}
      onChange={onViewChange}
      options={ACTIVITY_VIEWS.map((value) => ({ value, label: t(`${ns}.views.${value}`) }))}
    />
  );

  return (
    <Section icon={<ClockIcon className="h-5 w-5" />} title={t('admin.users.detail.tabs.activity')}>
      {filter}
      {view === 'tickets' ? (
        <TicketsTab userId={userId} />
      ) : view === 'emails' ? (
        <EmailLogTab userId={userId} currentEmail={currentEmail} />
      ) : view === 'gifts' ? (
        <GiftsTab
          giftsLoading={giftsQuery.isFetching && !giftsQuery.data}
          giftsData={giftsQuery.data ?? null}
          onNavigateToUser={onNavigateToUser}
        />
      ) : (
        <ActivityTab userId={userId} types={FEED_TYPES[view]} />
      )}
    </Section>
  );
}
