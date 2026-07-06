import { Hono } from 'hono';
import { every } from 'hono/combine';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './app-env';
import { createPropertyRoutes, type PropertyRouteDeps } from './modules/property/http/property.routes';
import {
  createChannelRoutes,
  createPublicChannelRoutes,
  type ChannelRouteDeps,
} from './modules/channel/http/channel.routes';
import { createListingRoutes, type ListingRouteDeps } from './modules/channel/http/listing.routes';
import { createCalendarRoutes, type CalendarRouteDeps } from './modules/calendar/http/calendar.routes';
import {
  createAvailabilityRoutes,
  type AvailabilityRouteDeps,
} from './modules/availability/http/availability.routes';
import {
  createReservationRoutes,
  type ReservationRouteDeps,
} from './modules/reservation/http/reservation.routes';
import { createPricingRoutes, type PricingRouteDeps } from './modules/pricing/http/pricing.routes';
import { createPublicGuestRoutes, type GuestRouteDeps } from './modules/guest/http/guest.routes';
import { createCleaningRoutes, type CleaningRouteDeps } from './modules/cleaning/http/cleaning.routes';
import {
  createNotificationRoutes,
  type NotificationRouteDeps,
} from './modules/notification/http/notification.routes';
import { createReportsRoutes, type ReportsRouteDeps } from './modules/reports/http/reports.routes';
import {
  createCommissionsRoutes,
  type CommissionsRouteDeps,
} from './modules/commissions/http/commissions.routes';
import { createAuthRoutes, type AuthRouteDeps } from './modules/identity/http/auth.routes';
import {
  createPaymentRoutes,
  createPublicPaymentRoutes,
  type PaymentRouteDeps,
} from './modules/payments/http/payment.routes';
import {
  createPublicSubscriptionRoutes,
  createSubscriptionRoutes,
  type SubscriptionRouteDeps,
} from './modules/subscriptions/http/subscription.routes';

/** Зависимости приложения, собираются в composition root (index.ts). */
export type AppDeps = {
  readonly requireAuth: MiddlewareHandler<AppEnv>;
  /** Гейт read-only биллинга тенанта; композируется с requireAuth для write-роутов бизнес-модулей. */
  readonly readOnlyGate: MiddlewareHandler<AppEnv>;
  readonly auth: AuthRouteDeps;
  readonly property: PropertyRouteDeps;
  readonly channel: ChannelRouteDeps;
  readonly listing: ListingRouteDeps;
  readonly calendar: CalendarRouteDeps;
  readonly availability: AvailabilityRouteDeps;
  readonly reservation: ReservationRouteDeps;
  readonly pricing: PricingRouteDeps;
  readonly payment: PaymentRouteDeps;
  readonly guest: GuestRouteDeps;
  readonly cleaning: CleaningRouteDeps;
  readonly notification: NotificationRouteDeps;
  readonly reports: ReportsRouteDeps;
  readonly commissions: CommissionsRouteDeps;
  readonly subscription: SubscriptionRouteDeps;
};

/**
 * Сборка Hono-приложения. Роуты чейнятся для вывода типов Hono RPC (AppType).
 * Публичное: /health, /auth (register/login), /feeds, /webhooks.
 * Защищённое: бизнес-модули используют `writableAuth` = requireAuth + read-only гейт
 * (write-методы блокируются при expired/canceled подписке). `/billing` — на чистом requireAuth:
 * это escape hatch, оплата должна работать и из read-only.
 */
export const buildApp = (deps: AppDeps) => {
  const writableAuth = every(deps.requireAuth, deps.readOnlyGate);
  return new Hono<AppEnv>()
    .get('/health', (c) => c.json({ status: 'ok' as const }))
    .route('/auth', createAuthRoutes(deps.auth))
    .route('/', createPublicChannelRoutes(deps.channel))
    .route('/', createPublicPaymentRoutes(deps.payment))
    .route('/', createPublicSubscriptionRoutes(deps.subscription))
    .route('/', createPublicGuestRoutes(deps.guest))
    .route('/properties', createPropertyRoutes(deps.property, writableAuth))
    .route('/listings', createListingRoutes(deps.listing, writableAuth))
    .route('/calendar', createCalendarRoutes(deps.calendar, writableAuth))
    .route('/availability', createAvailabilityRoutes(deps.availability, writableAuth))
    .route('/reservations', createReservationRoutes(deps.reservation, writableAuth))
    .route('/pricing', createPricingRoutes(deps.pricing, writableAuth))
    .route('/channels', createChannelRoutes(deps.channel, writableAuth))
    .route('/payments', createPaymentRoutes(deps.payment, writableAuth))
    .route('/cleaning', createCleaningRoutes(deps.cleaning, writableAuth))
    .route('/notifications', createNotificationRoutes(deps.notification, writableAuth))
    .route('/reports', createReportsRoutes(deps.reports, writableAuth))
    .route('/commissions', createCommissionsRoutes(deps.commissions, writableAuth))
    .route('/billing', createSubscriptionRoutes(deps.subscription, deps.requireAuth));
};

export type AppType = ReturnType<typeof buildApp>;
