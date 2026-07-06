import type { ReactNode } from 'react';
import { matchPath, type Params } from '../shared/lib/router';
import { PropertiesPage } from '../pages/properties/PropertiesPage';
import { PropertyDetailPage } from '../pages/property-detail/PropertyDetailPage';
import { ChannelsPage } from '../pages/channels/ChannelsPage';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { TeamPage } from '../pages/team/TeamPage';
import { InboxPage } from '../pages/inbox/InboxPage';
import { PaymentsPage } from '../pages/payments/PaymentsPage';
import { CleaningPage } from '../pages/cleaning/CleaningPage';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { ReportsPage } from '../pages/reports/ReportsPage';
import { CommissionsPage } from '../pages/commissions/CommissionsPage';
import { BillingPage } from '../pages/billing/BillingPage';
import { GuestPage } from '../pages/guest/GuestPage';
import { PaymentReturnPage } from '../pages/payment-return/PaymentReturnPage';
import { CreateProperty } from '../widgets/create-property/CreateProperty';
import { ConnectChannel } from '../widgets/connect-channel/ConnectChannel';
import { ConnectProvider } from '../widgets/connect-provider/ConnectProvider';
import { PropertySettings } from '../widgets/property-settings/PropertySettings';

/**
 * Уровень 3 (реестр) — единый список роутов приложения. Каждый роут surface-agnostic:
 * `render` рисует ГОЛЫЙ контент и не знает, где он показан (main/sidebar/modal) — обёртку
 * (Modal/Sidebar/страница) добавляет рендерер в App по поверхности. Никаких сырых regex и
 * никакого matchModalRoute: одно объявление обслуживает и страницу, и модалку.
 */
export type RouteRenderApi = {
  /** Закрыть текущую поверхность (pop модалки / убрать сайдбар / уйти к родителю на странице). */
  readonly close: () => void;
};

export type AppRoute = {
  readonly id: string;
  /** Декларативный паттерн, напр. `/properties/:id/settings`. */
  readonly path: string;
  readonly render: (params: Params, api: RouteRenderApi) => ReactNode;
  /**
   * Хром для показа РОВНО как полноэкранная страница (прямой переход / новая вкладка):
   * back-ссылка к родителю. Отсутствует → `render` уже сам полноценная страница.
   */
  readonly page?: { readonly parent: (params: Params) => string; readonly backLabel: string };
  /** Публичный роут: без авторизации и без Nav (гость, возврат после оплаты). */
  readonly public?: boolean;
};

/**
 * Порядок важен: более специфичные/литеральные паттерны идут раньше параметрических с тем же
 * числом сегментов (`/properties/new` перед `/properties/:id`).
 */
export const routes: readonly AppRoute[] = [
  // overlay-роуты: page-хром → полноэкранная страница при прямом заходе; через <Link modal=…> — модалка.
  {
    id: 'property-create',
    path: '/properties/new',
    render: (_p, { close }) => <CreateProperty onDone={close} />,
    page: { parent: () => '/properties', backLabel: '← К объектам' },
  },
  {
    id: 'channel-connect',
    path: '/channels/new',
    render: (_p, { close }) => <ConnectChannel onDone={close} />,
    page: { parent: () => '/channels', backLabel: '← К площадкам' },
  },
  {
    id: 'payment-connect',
    path: '/payments/connect/:provider',
    render: (p, { close }) =>
      p.provider ? <ConnectProvider providerId={p.provider} onDone={close} /> : null,
    page: { parent: () => '/payments', backLabel: '← К платежам' },
  },
  {
    id: 'property-settings',
    path: '/properties/:id/settings',
    render: (p, { close }) => (p.id ? <PropertySettings id={p.id} onSaved={close} /> : null),
    page: {
      parent: (p) => (p.id ? `/properties/${p.id}` : '/properties'),
      backLabel: '← К объекту',
    },
  },

  // полноэкранные страницы
  { id: 'calendar', path: '/calendar', render: () => <CalendarPage /> },
  { id: 'team', path: '/team', render: () => <TeamPage /> },
  { id: 'inbox', path: '/inbox', render: () => <InboxPage /> },
  { id: 'inbox-thread', path: '/inbox/:threadId', render: () => <InboxPage /> },
  { id: 'channels', path: '/channels', render: () => <ChannelsPage /> },
  { id: 'payments', path: '/payments', render: () => <PaymentsPage /> },
  { id: 'cleaning', path: '/cleaning', render: () => <CleaningPage /> },
  { id: 'notifications', path: '/notifications', render: () => <NotificationsPage /> },
  { id: 'reports', path: '/reports', render: () => <ReportsPage /> },
  { id: 'commissions', path: '/commissions', render: () => <CommissionsPage /> },
  { id: 'billing', path: '/billing', render: () => <BillingPage /> },
  {
    id: 'property-detail',
    path: '/properties/:id',
    render: (p) => (p.id ? <PropertyDetailPage id={p.id} /> : null),
  },
  { id: 'properties', path: '/properties', render: () => <PropertiesPage /> },
  { id: 'home', path: '/', render: () => <PropertiesPage /> },

  // публичные
  {
    id: 'guest',
    path: '/guest/:token',
    render: (p) => (p.token ? <GuestPage token={p.token} /> : null),
    public: true,
  },
  { id: 'payment-return', path: '/payment/return', render: () => <PaymentReturnPage />, public: true },
];

export type RouteMatch = { readonly route: AppRoute; readonly params: Params };

/** Первый роут, чей паттерн совпал с путём (порядок реестра = приоритет). */
export const matchRoute = (path: string): RouteMatch | null => {
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
};
