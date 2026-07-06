import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import { buildApp } from './app';
import { createDb } from './db/client';
import { createDrizzlePropertyRepo } from './modules/property/adapters/property-repo.drizzle';
import { createCianAdapter } from './modules/channel/adapters/cian/cian-adapter';
import { createAvitoAdapter } from './modules/channel/adapters/avito/avito-adapter';
import { createAdapterRegistry } from './modules/channel/adapters/registry';
import { createDrizzleChannelAccountRepo } from './modules/channel/adapters/drizzle/channel-account-repo.drizzle';
import { createDrizzleListingLinkRepo } from './modules/channel/adapters/drizzle/listing-link-repo.drizzle';
import { createDrizzleMessageStore } from './modules/channel/adapters/drizzle/message-store.drizzle';
import { createDrizzleThreadStore } from './modules/channel/adapters/drizzle/thread-store.drizzle';
import { createDrizzleInboxRepo } from './modules/channel/adapters/drizzle/channel-inbox.drizzle';
import { createDrizzleFeedHost } from './modules/channel/adapters/drizzle/feed-host.drizzle';
import { createDrizzleAvailabilitySyncOutbox } from './modules/channel/adapters/drizzle/availability-sync-outbox.drizzle';
import { createDrizzleSecretVault } from './shared/adapters/secret-vault.drizzle';
import { createDrizzleAuditLog } from './shared/adapters/audit-log.drizzle';
import { handleWebhook } from './modules/channel/application/handle-webhook';
import { ingestChannelEvent } from './modules/channel/application/ingest-event';
import { replyToThread } from './modules/channel/application/send-message';
import { publishListings } from './modules/channel/application/publish-listings';
import {
  connectChannel,
  deleteChannel,
  disconnectChannel,
  listChannels,
  reconnectChannel,
} from './modules/channel/application/manage-channels';
import {
  attachListing,
  createManagedListing,
  listPropertyListings,
  removeListing,
} from './modules/channel/application/manage-listings';
import { startIngestion } from './modules/channel/application/run-ingestion';
import { startReconciler } from './modules/channel/application/run-reconciler';
import { markListingsOutdated } from './modules/channel/application/mark-listings-outdated';
import { startOutbox } from './modules/channel/application/run-outbox';
import { getCalendar } from './modules/calendar/application/get-calendar';
import type { CalendarPriceSource } from './modules/calendar/ports/price-source';
import { createDrizzlePriceRuleRepo } from './modules/pricing/adapters/price-rule-repo.drizzle';
import { createDrizzlePriceOverrideRepo } from './modules/pricing/adapters/price-override-repo.drizzle';
import { buildNightlyResolver, getPropertyPricing } from './modules/pricing/application/read-pricing';
import { createPriceRule, removePriceRule } from './modules/pricing/application/manage-rules';
import { removePriceOverride, setPriceOverride } from './modules/pricing/application/manage-overrides';
import { getStayQuote } from './modules/pricing/application/quote-stay';
import { getReport } from './modules/reports/application/get-report';
import { createDrizzleCommissionRuleRepo } from './modules/commissions/adapters/commission-rule-repo.drizzle';
import {
  listCommissionRules,
  setCommissionRule,
} from './modules/commissions/application/manage-rules';
import { getCommissionReport } from './modules/commissions/application/get-commission-report';
import { createInMemoryEventBus } from './shared/event-bus';
import { createInMemoryRealtimeHub } from './shared/realtime-hub';
import { withMessageEvents } from './modules/channel/adapters/event-message-store';
import { createDrizzleHoldRepo } from './modules/availability/adapters/hold-repo.drizzle';
import { withAvailabilityEvents } from './modules/availability/adapters/event-hold-repo';
import { createBlock, removeBlock } from './modules/availability/application/block-dates';
import {
  startAvailabilitySync,
  startAvailabilitySyncWorker,
} from './modules/channel/application/run-availability-sync';
import { createDrizzleReservationRepo } from './modules/reservation/adapters/reservation-repo.drizzle';
import { createReservation } from './modules/reservation/application/create-reservation';
import {
  cancelReservation,
  listPropertyReservations,
} from './modules/reservation/application/cancel-reservation';
import { ingestReservation } from './modules/reservation/application/ingest-reservation';
import { confirmReservation } from './modules/reservation/application/confirm-reservation';
import { expireReservations } from './modules/reservation/application/expire-reservations';
import type { AvailabilityPort } from './modules/reservation/ports/availability';
import type { ListingResolver } from './modules/reservation/ports/listing-resolver';
import { createDrizzleOrgRepo } from './modules/identity/adapters/drizzle/org-repo.drizzle';
import { createDrizzleUserRepo } from './modules/identity/adapters/drizzle/user-repo.drizzle';
import { createDrizzleSessionRepo } from './modules/identity/adapters/drizzle/session-repo.drizzle';
import { createScryptHasher } from './modules/identity/adapters/crypto/scrypt-hasher';
import { createTokenGenerator } from './modules/identity/adapters/crypto/token-generator';
import { register } from './modules/identity/application/register';
import { login } from './modules/identity/application/login';
import { logout } from './modules/identity/application/logout';
import { authenticate } from './modules/identity/application/authenticate';
import { createMember, listMembers } from './modules/identity/application/manage-members';
import type { IssueSessionDeps } from './modules/identity/application/issue-session';
import { createRequireAuth } from './modules/identity/http/auth-middleware';
import { createReadOnlyGate } from './modules/subscriptions/http/read-only-gate';
import { createPaymentProviderRegistry } from './modules/payments/adapters/registry';
import { createGenericHostedLinkAdapter } from './modules/payments/adapters/generic/hosted-link';
import { createManualAdapter } from './modules/payments/adapters/generic/manual';
import { createRobokassaAdapter } from './modules/payments/adapters/robokassa/robokassa-adapter';
import { createTochkaAdapter } from './modules/payments/adapters/tochka/tochka-adapter';
import { createYooKassaAdapter } from './modules/payments/adapters/yookassa/yookassa-adapter';
import { createFetchHttpJson, createYooKassaClient } from './shared/integrations/yookassa/client';
import { createYooKassaBillingGateway } from './modules/subscriptions/adapters/yookassa-billing-gateway';
import {
  createDevAllowAllPhoneVerification,
  createHeuristicRiskScorer,
  createInMemoryPlanRepo,
} from './modules/subscriptions/adapters/memory/memory-repos';
import {
  createDrizzleCardLedger,
  createDrizzleCardSetupIntentRepo,
  createDrizzleSubscriptionRepo,
  createDrizzleTrialEligibilityLedger,
} from './modules/subscriptions/adapters/drizzle/subscription-repos.drizzle';
import { subscribeToPlan } from './modules/subscriptions/application/subscribe-to-plan';
import { confirmCardSetup } from './modules/subscriptions/application/confirm-card-setup';
import { payForPeriod } from './modules/subscriptions/application/pay-for-period';
import { runTrialExpiry } from './modules/subscriptions/application/run-trial-expiry';
import { toSubscriptionView } from './modules/subscriptions/domain/view';
import { DEFAULT_TRIAL_DAYS } from './modules/subscriptions/domain/subscription';
import {
  createDrizzlePaymentAccountRepo,
  createDrizzlePaymentInbox,
  createDrizzlePaymentPlanRepo,
  createDrizzlePaymentRepo,
} from './modules/payments/adapters/drizzle/payment-repos.drizzle';
import {
  connectProvider,
  disconnectProvider,
  listProviderAccounts,
  listProviders,
} from './modules/payments/application/manage-providers';
import { buildDirectPlan } from './modules/payments/application/build-plan';
import { initPayment } from './modules/payments/application/init-payment';
import { confirmManualPayment, type PaymentAudit } from './modules/payments/application/confirm-manual';
import { handlePaymentWebhook } from './modules/payments/application/handle-webhook';
import { listReservationPayments } from './modules/payments/application/read-payments';
import { getGuestView } from './modules/guest/application/get-guest-view';
import { payGuest } from './modules/guest/application/pay-guest';
import { createDrizzleCleaningRepo } from './modules/cleaning/adapters/cleaning-repo.drizzle';
import { reconcileCleaning } from './modules/cleaning/application/reconcile-cleaning';
import {
  assignCleaning,
  completeCleaning,
  createCleaning,
  startCleaning,
} from './modules/cleaning/application/manage-cleaning';
import { listCleaningBoard, listMyCleaning } from './modules/cleaning/application/read-cleaning';
import type { CleaningEvents, CleaningReservationSource } from './modules/cleaning/ports';
import { createDrizzleNotificationRepo } from './modules/notification/adapters/notification-repo.drizzle';
import { createInAppChannel } from './modules/notification/adapters/in-app-channel';
import { createEmailChannel } from './modules/notification/adapters/email-channel';
import { createNotificationChannelRegistry } from './modules/notification/adapters/registry';
import { dispatchNotification } from './modules/notification/application/dispatch';
import { startNotifications } from './modules/notification/application/policy';
import {
  getNotificationFeed,
  markAllNotificationsRead,
  markNotificationRead,
} from './modules/notification/application/read-notifications';
import type { RecipientResolver } from './modules/notification/ports';
import type { ChannelAccount, ExternalBooking } from './modules/channel/domain/types';
import type { ListingSource, OccupancySource, PropertyLookup, Scheduler } from './modules/channel/ports/repos';
import type { Clock } from './shared/ports';

/**
 * Composition root: создаём конкретные адаптеры и внедряем их в приложение.
 * Всё остальное зависит от абстракций.
 */
const DEMO_ORG = '00000000-0000-0000-0000-000000000001';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'; // API (вебхуки/фиды)
// База web-SPA — куда провайдер ВОЗВРАЩАЕТ браузер после оплаты (страницы /guest, /payment/return).
// В деве отличается от API (Vite :5173); в проде за реверс-прокси может совпадать.
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:5173';

const main = async () => {
  const clock: Clock = { now: () => new Date() };

  // --- Persistence: настоящий Postgres через PGlite ---
  const db = await createDb();

  // --- Properties (БД) ---
  const propertyRepo = createDrizzlePropertyRepo(db);

  // --- События между модулями (клей, low coupling) ---
  const bus = createInMemoryEventBus();
  // --- Realtime-хаб (транспорт для SSE инбокса; изолирован по орге) ---
  const realtime = createInMemoryRealtimeHub();

  // --- Availability (holds: бронь/блок/уборка как единый источник занятости) ---
  const holdRepo = createDrizzleHoldRepo(db);
  // Изменение занятости публикует availability.changed → синк доступности в каналы.
  const eventHoldRepo = withAvailabilityEvents(holdRepo, bus);
  const blockDeps = { holds: eventHoldRepo, idGen: () => randomUUID(), clock };

  // --- Reservations ---
  const reservationRepo = createDrizzleReservationRepo(db);
  // Узкий порт доступности для броней поверх holdRepo (захват = hold вида 'reservation').
  const availabilityForReservations: AvailabilityPort = {
    hold: async ({ orgId, propertyId, from, to, refId, note, tier, expiresAt }) => {
      const now = clock.now().toISOString();
      const result = await eventHoldRepo.insertIfFree(
        {
          id: randomUUID(),
          orgId,
          propertyId,
          from,
          to,
          kind: 'reservation',
          tier,
          expiresAt,
          refId,
          note,
          createdAt: now,
        },
        now,
      );
      return result.map((r) => ({
        id: r.hold.id,
        preemptedRefIds: r.preempted.map((p) => p.refId).filter((x): x is string => x !== null),
      }));
    },
    release: (orgId, holdId) => eventHoldRepo.remove(orgId, holdId),
    promote: (orgId, holdId) => eventHoldRepo.promote(orgId, holdId, clock.now().toISOString()),
    releaseExpired: async () => {
      const released = await eventHoldRepo.releaseExpired(clock.now().toISOString());
      return released
        .filter((h): h is typeof h & { refId: string } => h.refId !== null)
        .map((h) => ({ orgId: h.orgId, refId: h.refId }));
    },
  };

  // В каналы пушим занятость ТОЛЬКО по firm-холдам: tentative (наш checkout/заявка) не закрывает
  // внешний инвентарь, иначе гриф на нашей стороне обнулил бы доступность на площадках.
  const occupancyFirm: OccupancySource = {
    listForRange: async (orgId, from, to) =>
      (await holdRepo.listForRange(orgId, from, to))
        .filter((h) => h.tier === 'firm')
        .map((h) => ({ propertyId: h.propertyId, from: h.from, to: h.to })),
  };

  // Календарь: показываем firm + неистёкшие tentative (как 'pending'); истёкшие — свободно.
  const calendarHolds = {
    listForRange: async (orgId: string, from: string, to: string) => {
      const now = clock.now().toISOString();
      return (await holdRepo.listForRange(orgId, from, to))
        .filter((h) => h.tier === 'firm' || h.expiresAt === null || h.expiresAt > now)
        .map((h) => ({ id: h.id, propertyId: h.propertyId, from: h.from, to: h.to, kind: h.kind, tier: h.tier, label: h.note }));
    },
  };
  // Токен гостевой страницы (неугадываемый) + 6-значный код доступа.
  const genGuestToken = () => randomUUID().replace(/-/g, '');
  const genAccessCode = () => String(Math.floor(100000 + Math.random() * 900000));
  const reservationDeps = {
    reservations: reservationRepo,
    availability: availabilityForReservations,
    idGen: () => randomUUID(),
    clock,
    genToken: genGuestToken,
    genCode: genAccessCode,
  };

  // --- Commissions (комиссии площадок per-channel + отчёт по комиссиям) ---
  const commissionRuleRepo = createDrizzleCommissionRuleRepo(db);

  // --- Pricing (база + правила сезон/выходные/день недели/наценка канала + ручные оверрайды) ---
  const priceRuleRepo = createDrizzlePriceRuleRepo(db);
  const priceOverrideRepo = createDrizzlePriceOverrideRepo(db);
  const pricingDeps = { rules: priceRuleRepo, overrides: priceOverrideRepo };
  // Источник «нашей» цены за ночь для календаря (модуль calendar не знает про движок прайсинга).
  const calendarPrices: CalendarPriceSource = {
    resolverForRange: buildNightlyResolver(pricingDeps),
  };

  // --- Identity / Auth ---
  const orgs = createDrizzleOrgRepo(db);
  const users = createDrizzleUserRepo(db);
  const sessionRepo = createDrizzleSessionRepo(db);
  const hasher = createScryptHasher();
  const tokens = createTokenGenerator();
  const sessionDeps: IssueSessionDeps = {
    sessions: sessionRepo,
    tokens,
    clock,
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 дней
  };
  const requireAuth = createRequireAuth(authenticate({ sessions: sessionRepo, users, tokens, clock }));
  const memberDeps = { users, hasher, idGen: () => randomUUID(), clock };
  const authRoutes = {
    register: register({ orgs, users, hasher, session: sessionDeps, idGen: () => randomUUID(), clock }),
    login: login({ users, hasher, session: sessionDeps }),
    logout: logout({ sessions: sessionRepo, tokens }),
    createMember: createMember(memberDeps),
    listMembers: listMembers(memberDeps),
    requireAuth,
  };

  // DEV SEED: при пустой БД — демо-организация, владелец и объект.
  // Вход: owner@demo.local / password123
  if (!(await users.getByEmail('owner@demo.local'))) {
    const now = new Date().toISOString();
    await orgs.save({ id: DEMO_ORG, name: 'Демо-агентство', createdAt: now });
    await users.save({
      id: randomUUID(),
      orgId: DEMO_ORG,
      email: 'owner@demo.local',
      passwordHash: await hasher.hash('password123'),
      role: 'owner',
      createdAt: now,
    });
    await propertyRepo.save({
      id: randomUUID(),
      orgId: DEMO_ORG,
      title: 'Студия на Арбате',
      address: 'ул. Арбат, 10',
      basePriceMinor: 350_000,
      currency: 'RUB',
      checkInTime: '14:00',
      checkOutTime: '12:00',
      createdAt: now,
    });
  }

  // --- Channels ---
  const channelAccounts = createDrizzleChannelAccountRepo(db);
  const listingLinks = createDrizzleListingLinkRepo(db);
  const vault = createDrizzleSecretVault(db, 'ch');
  const feedHost = createDrizzleFeedHost(db);
  const inbox = createDrizzleInboxRepo(db);
  // Диалоги: наш внутренний id ↔ тред площадки. Достраиваем по уже накопленным сообщениям.
  const threadStore = createDrizzleThreadStore(db);
  await threadStore.backfillFromMessages();
  // Обёртка над стором: каждый append (входящее/исходящее) отражается в realtime-хаб → SSE.
  const messageStore = withMessageEvents(createDrizzleMessageStore(db, threadStore), realtime);
  const availabilityOutbox = createDrizzleAvailabilitySyncOutbox(db);

  // Достаём ACCESS KEY аккаунта из vault (Cian хранит { accessKey }).
  const resolveAccessKey = async (account: { credentialsRef: string | null }): Promise<string | null> => {
    if (!account.credentialsRef) return null;
    const secret = await vault.get(account.credentialsRef);
    return secret?.accessKey ?? null;
  };

  // Базы API: прод → реальные площадки; дев → фейк (env). Интервалы — для быстрой ручной проверки.
  const CIAN_API_BASE = process.env.CIAN_API_BASE ?? 'https://public-api.cian.ru';
  const CIAN_FEEDBACK_POLL_SEC = Number(process.env.CIAN_FEEDBACK_POLL_SEC ?? 1800);
  const AVITO_API_BASE = process.env.AVITO_API_BASE ?? 'https://api.avito.ru';
  const AVITO_DEFAULT_USER_ID = process.env.AVITO_USER_ID ?? '1';

  // OAuth-креды активного Avito-аккаунта организации из vault ({ clientId, clientSecret }).
  const resolveAvitoCreds = async (orgId: string) => {
    const account = (await channelAccounts.listByOrg(orgId)).find(
      (a) => a.platform === 'avito' && a.status === 'active',
    );
    if (!account?.credentialsRef) return null;
    const secret = await vault.get(account.credentialsRef);
    if (!secret?.clientId || !secret.clientSecret) return null;
    return {
      clientId: secret.clientId,
      clientSecret: secret.clientSecret,
      userId: secret.userId ?? AVITO_DEFAULT_USER_ID,
    };
  };

  const registry = createAdapterRegistry([
    createCianAdapter({
      apiBase: CIAN_API_BASE,
      feedbackPollSec: CIAN_FEEDBACK_POLL_SEC,
      resolveAccessKey,
      publicBaseUrl: PUBLIC_BASE_URL,
    }),
    createAvitoAdapter({ apiBase: AVITO_API_BASE, resolveCreds: resolveAvitoCreds }),
  ]);

  // Приём вебхуков площадок → нормализация → unified inbox (дедуп через inbox).
  // Резолв объекта по id листинга на площадке (для входящих броней).
  const listingResolver: ListingResolver = {
    propertyIdFor: async (orgId, source, externalListingId) => {
      if (source === 'direct') return null;
      const link = await listingLinks.getByPlatformListingId(orgId, source, externalListingId);
      return link?.propertyId ?? null;
    },
  };
  // TTL мягкого холда для заявок с площадки (необработанная заявка освобождает даты).
  const TENTATIVE_TTL_MS = Number(process.env.TENTATIVE_TTL_MS ?? 15 * 60 * 1000);
  const ingestReservationFn = ingestReservation({
    reservations: reservationRepo,
    availability: availabilityForReservations,
    listings: listingResolver,
    idGen: () => randomUUID(),
    clock,
    tentativeTtlMs: TENTATIVE_TTL_MS,
    genToken: genGuestToken,
    genCode: genAccessCode,
  });
  // Адаптер ExternalBooking → ingest (channel-модуль не знает про Reservations).
  const ingestBookingFn = async (orgId: string, booking: ExternalBooking): Promise<void> => {
    await ingestReservationFn(orgId, {
      source: booking.platform,
      externalId: booking.externalBookingId,
      externalListingId: booking.externalListingId,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guestName: booking.guestName ?? 'Гость',
      amountMinor: booking.amountMinor,
      currency: booking.currency,
      status: booking.status, // 'new' → tentative; 'confirmed' → firm; 'cancelled' → отмена
    });
  };
  // Подтверждение брони по оплате (pending → confirmed, tentative → firm) + sweeper истечения.
  const confirmReservationFn = confirmReservation({
    reservations: reservationRepo,
    availability: availabilityForReservations,
  });
  const expireReservationsFn = expireReservations({
    reservations: reservationRepo,
    availability: availabilityForReservations,
  });

  // Единая проекция входящих событий канала в домен — общая для push-вебхука и поллинга.
  const ingestEventFn = ingestChannelEvent({
    inbox,
    messages: messageStore,
    ingestBooking: ingestBookingFn,
  });
  const handleWebhookFn = handleWebhook({
    registry,
    accounts: channelAccounts,
    ingest: ingestEventFn,
  });
  const replyToThreadFn = replyToThread({
    registry,
    accounts: channelAccounts,
    threads: threadStore,
    messages: messageStore,
    idGen: () => randomUUID(),
    clock,
  });

  const manageDeps = {
    accounts: channelAccounts,
    vault,
    idGen: () => randomUUID(),
    clock,
    publicBaseUrl: PUBLIC_BASE_URL,
    // Подключили площадку → поднять её ingestion/reconciler без рестарта (регистрирует вебхуки).
    onConnected: (account: ChannelAccount) => {
      const adapter = registry.get(account.platform);
      if (adapter && account.status === 'active') {
        start(account, adapter);
        reconcile(account, adapter);
      }
    },
    // Отключили → снять регистрацию вебхуков у площадки (push-messaging).
    onDisconnected: async (account: ChannelAccount) => {
      const ingest = registry.get(account.platform)?.messaging?.ingest;
      if (ingest?.mode === 'push' && ingest.unsubscribe) await ingest.unsubscribe(account);
    },
  };

  // Объявления: проверка существования объекта без зависимости от модуля Properties.
  const propertyLookup: PropertyLookup = {
    exists: async (orgId, propertyId) => (await propertyRepo.getById(orgId, propertyId)) !== null,
  };
  const listingDeps = {
    listings: listingLinks,
    accounts: channelAccounts,
    properties: propertyLookup,
    registry,
    idGen: () => randomUUID(),
  };

  // Фид собирается только из managed-листингов площадки.
  const listingSource: ListingSource = {
    listManagedForPlatform: async (orgId, platform) => {
      const links = await listingLinks.listManagedByOrgPlatform(orgId, platform);
      const inputs = await Promise.all(
        links.map(async (link) => {
          const property = await propertyRepo.getById(orgId, link.propertyId);
          if (!property) return null;
          return {
            externalId: link.externalId,
            title: property.title,
            description: `${property.title} — ${property.address}`,
            address: property.address,
            category: 'flat_rent' as const,
            basePriceMinor: property.basePriceMinor,
            currency: property.currency,
            photos: [],
          };
        }),
      );
      return inputs.filter((input): input is NonNullable<typeof input> => input !== null);
    },
  };

  const publish = publishListings({
    accounts: channelAccounts,
    listings: listingSource,
    links: listingLinks,
    feedHost,
    registry,
    clock,
    publicBaseUrl: PUBLIC_BASE_URL,
  });

  // Ingestion Runner: единый приём входящих (push/poll → нормализованный стор).
  const scheduler: Scheduler = {
    every: (intervalSec, task) => {
      setInterval(() => void task(), intervalSec * 1000);
    },
  };
  // Поллинг (и push-subscribe) сводятся в ту же проекцию `ingestEventFn`, что и публичный вебхук.
  const start = startIngestion({ scheduler, handle: ingestEventFn });
  // Reconciler: обратная связь по публикации (poll get-order / webhook) → статус в ListingLink.
  const reconcile = startReconciler({ scheduler, listings: listingLinks, clock });

  // Sweeper: добивает истёкшие tentative-холды → брони 'expired' (+ availability.changed).
  scheduler.every(60, expireReservationsFn);
  for (const account of await channelAccounts.listAll()) {
    const adapter = registry.get(account.platform);
    if (adapter && account.status === 'active') {
      start(account, adapter);
      reconcile(account, adapter);
    }
  }

  // Outbox: queued-связи → автопубликация (queued → pushed). Замыкает цикл синхронизации.
  startOutbox({
    scheduler,
    accounts: channelAccounts,
    links: listingLinks,
    publish: publish,
    intervalSec: 60,
  })();

  // Availability → каналы (durable): на availability.changed кладём задачу в outbox,
  // воркер дренирует её и пушит доступность на 60 дней вперёд в per-date каналы (Avito) с ретраями.
  startAvailabilitySync({ bus, outbox: availabilityOutbox, clock })();
  startAvailabilitySyncWorker({
    scheduler,
    outbox: availabilityOutbox,
    occupancy: occupancyFirm,
    links: listingLinks,
    registry,
    clock,
    windowDays: 60,
    intervalSec: 15,
    batchSize: 20,
    maxAttempts: 10,
  })();

  // Контент/цена объекта изменились: фид-листинги → устаревшие (перевыложит outbox);
  // Avito → цена по датам через API (для привязанных листингов с item_id).
  const markOutdated = markListingsOutdated({ listings: listingLinks });
  const onContentChanged = async (orgId: string, propertyId: string): Promise<void> => {
    await markOutdated(orgId, propertyId);
    const avito = registry.get('avito');
    const property = await propertyRepo.getById(orgId, propertyId);
    if (!avito?.priceSync || !property) return;
    const startMs = Date.now();
    const updates = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(startMs + i * 86_400_000).toISOString().slice(0, 10),
      amountMinor: property.basePriceMinor,
    }));
    for (const link of await listingLinks.listByProperty(orgId, propertyId)) {
      if (link.platform === 'avito' && link.platformListingId) {
        void avito.priceSync.pushPrices(link, updates);
      }
    }
  };

  // --- Payments (ADR-0001/0002): сторонние ПС через open registry + манифест ---
  // Generic-адаптеры (long tail) + manual за тем же портом; first-party (Robokassa и т.п.)
  // подключатся сюда же. Persistence — in-memory (см. открытый вопрос ADR-0002).
  const paymentVault = createDrizzleSecretVault(db, 'pay');
  const paymentAccounts = createDrizzlePaymentAccountRepo(db);
  const paymentRepo = createDrizzlePaymentRepo(db);
  const paymentPlans = createDrizzlePaymentPlanRepo(db);
  const paymentInbox = createDrizzlePaymentInbox(db);
  const ROBOKASSA_API_BASE = process.env.ROBOKASSA_API_BASE ?? 'https://auth.robokassa.ru';
  const TOCHKA_API_BASE = process.env.TOCHKA_API_BASE ?? 'https://enter.tochka.com/uapi';
  // Общий протокол-клиент ЮKassa — переиспользуется и для броней, и для подписок (отличие — креды).
  const YOOKASSA_API_BASE = process.env.YOOKASSA_API_BASE ?? 'https://api.yookassa.ru/v3';
  const yookassaClient = createYooKassaClient({ apiBase: YOOKASSA_API_BASE, http: createFetchHttpJson() });
  const paymentRegistry = createPaymentProviderRegistry([
    createGenericHostedLinkAdapter({ getSecret: (ref) => paymentVault.get(ref) }),
    createManualAdapter(),
    createRobokassaAdapter({ apiBase: ROBOKASSA_API_BASE, getSecret: (ref) => paymentVault.get(ref) }),
    createTochkaAdapter({ apiBase: TOCHKA_API_BASE, getSecret: (ref) => paymentVault.get(ref) }),
    // Оплата броней арендаторами через магазин арендодателя (креды из vault).
    createYooKassaAdapter({ client: yookassaClient, getSecret: (ref) => paymentVault.get(ref) }),
  ]);
  const paymentManageDeps = {
    registry: paymentRegistry,
    accounts: paymentAccounts,
    vault: paymentVault,
    idGen: () => randomUUID(),
    clock,
    publicBaseUrl: PUBLIC_BASE_URL, // для webhook-URL (ResultURL) в карточке аккаунта
  };
  const auditLog = createDrizzleAuditLog(db, clock);
  const paymentAudit: PaymentAudit = {
    record: (entry) =>
      auditLog.record({
        orgId: entry.orgId,
        actor: entry.actor,
        action: entry.action,
        targetType: 'payment',
        targetId: entry.paymentId,
        meta: { amountMinor: entry.amountMinor },
      }),
  };

  // Инициация платежа — общий экземпляр для защищённого роута и гостевого портала.
  const initPaymentFn = initPayment({
    registry: paymentRegistry,
    accounts: paymentAccounts,
    plans: paymentPlans,
    payments: paymentRepo,
    idGen: () => randomUUID(),
    clock,
    publicBaseUrl: PUBLIC_BASE_URL,
  });

  // --- Subscriptions (SaaS-биллинг тенанта): триал + подписка арендодателя ---
  // Persistence пока in-memory (drizzle-адаптеры — следующий шаг). Платёжный шлюз — ЮKassa на
  // НАШИХ кредах (в отличие от броней, где креды арендодателя из vault).
  const subscriptionRepo = createDrizzleSubscriptionRepo(db);
  const cardSetupIntentRepo = createDrizzleCardSetupIntentRepo(db);
  const cardLedger = createDrizzleCardLedger(db);
  const planRepo = createInMemoryPlanRepo([
    {
      id: process.env.DEFAULT_PLAN_ID ?? 'pro',
      name: 'Pro',
      priceMinor: Number(process.env.DEFAULT_PLAN_PRICE_MINOR ?? 290000),
      currency: 'RUB',
      trialDays: Number(process.env.TRIAL_DAYS ?? DEFAULT_TRIAL_DAYS),
      periodDays: 30,
    },
  ]);
  const billingGateway = createYooKassaBillingGateway({
    client: yookassaClient,
    credentials: {
      shopId: process.env.YOOKASSA_PLATFORM_SHOP_ID ?? '',
      secretKey: process.env.YOOKASSA_PLATFORM_SECRET_KEY ?? '',
    },
    verificationAmountMinor: Number(process.env.CARD_HOLD_AMOUNT_MINOR ?? 1000), // ₽10
    currency: 'RUB',
  });
  const subscribeToPlanFn = subscribeToPlan({
    plans: planRepo,
    subscriptions: subscriptionRepo,
    ledger: createDrizzleTrialEligibilityLedger(db),
    riskScorer: createHeuristicRiskScorer(),
    gateway: billingGateway,
    cardSetupIntents: cardSetupIntentRepo,
    phoneVerification: createDevAllowAllPhoneVerification(), // TODO: реальная верификация звонком
    clock,
    idGen: () => randomUUID(),
  });
  const confirmCardSetupFn = confirmCardSetup({
    gateway: billingGateway,
    cardSetupIntents: cardSetupIntentRepo,
    subscriptions: subscriptionRepo,
    plans: planRepo,
    cardLedger,
    clock,
    idGen: () => randomUUID(),
  });
  const payFn = payForPeriod({
    subscriptions: subscriptionRepo,
    plans: planRepo,
    gateway: billingGateway,
    cardSetupIntents: cardSetupIntentRepo,
    clock,
    idGen: () => randomUUID(),
  });
  // Фоновое истечение триалов: carded → автобиллинг → active; cardless/отказ → expired (read-only).
  const runTrialExpiryFn = runTrialExpiry({ subscriptions: subscriptionRepo, plans: planRepo, gateway: billingGateway, clock });
  scheduler.every(Number(process.env.TRIAL_EXPIRY_POLL_SEC ?? 3600), async () => {
    await runTrialExpiryFn();
  });

  // --- Guest Portal (публичный доступ по токену) ---
  const guestByToken = async (token: string) => {
    const r = await reservationRepo.getByGuestToken(token);
    return r
      ? {
          orgId: r.orgId,
          id: r.id,
          propertyId: r.propertyId,
          guestName: r.guestName,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          status: r.status,
          accessCode: r.accessCode,
        }
      : null;
  };
  const guestDeps = {
    getGuestView: getGuestView({
      reservations: { byToken: guestByToken },
      properties: {
        get: async (orgId: string, propertyId: string) => {
          const p = await propertyRepo.getById(orgId, propertyId);
          return p
            ? { title: p.title, address: p.address, checkInTime: p.checkInTime, checkOutTime: p.checkOutTime }
            : null;
        },
      },
      payments: {
        payableLeg: async (orgId: string, reservationId: string) => {
          const plan = await paymentPlans.getByReservation(orgId, reservationId);
          const leg = plan?.legs.find((l) => l.collector.kind === 'provider' && l.status !== 'paid');
          return leg && leg.collector.kind === 'provider'
            ? { legId: leg.id, amountMinor: leg.amountMinor, currency: leg.currency, provider: leg.collector.provider }
            : null;
        },
      },
    }),
    payGuest: payGuest({
      reservations: { byToken: guestByToken },
      payments: {
        init: async (orgId: string, reservationId: string, legId: string, returnUrl: string) => {
          const result = await initPaymentFn(orgId, { reservationId, legId }, returnUrl);
          return result.isOk() ? { redirectUrl: result.value.redirectUrl } : null;
        },
      },
      publicBaseUrl: WEB_BASE_URL, // возврат браузера гостя → web-страница /guest/:token
    }),
  };

  // --- Operations / Cleaning (reconciler: самозалечивающийся, decoupled от Reservations) ---
  const cleaningRepo = createDrizzleCleaningRepo(db);
  const cleaningEvents: CleaningEvents = {
    created: (e) => bus.publish({ type: 'cleaning.created', ...e }),
    assigned: (e) => bus.publish({ type: 'cleaning.assigned', ...e }),
  };
  const cleaningReservationSource: CleaningReservationSource = {
    confirmedTurnovers: async () =>
      (await reservationRepo.listConfirmedForCleaning()).map((r) => ({
        orgId: r.orgId,
        reservationId: r.id,
        propertyId: r.propertyId,
        checkOut: r.checkOut,
        guestName: r.guestName,
      })),
  };
  const cleaningManageDeps = { tasks: cleaningRepo, events: cleaningEvents, idGen: () => randomUUID(), clock };
  const reconcileCleaningFn = reconcileCleaning({
    tasks: cleaningRepo,
    reservations: cleaningReservationSource,
    events: cleaningEvents,
    idGen: () => randomUUID(),
    clock,
  });
  scheduler.every(30, reconcileCleaningFn); // авто-генерация уборок от выездов + отмена осиротевших

  // --- Notifications (политика поверх шины событий; capability-каналы in_app/email) ---
  const notificationRepo = createDrizzleNotificationRepo(db);
  const recipientResolver: RecipientResolver = {
    staffOf: async (orgId) =>
      (await users.listByOrg(orgId)).filter((u) => u.role === 'owner' || u.role === 'manager').map((u) => u.id),
    emailOf: async (userId) => (await users.getById(userId))?.email ?? null,
  };
  const notificationRegistry = createNotificationChannelRegistry([
    createInAppChannel({ repo: notificationRepo, idGen: () => randomUUID(), clock }),
    createEmailChannel({ recipients: recipientResolver }),
  ]);
  const dispatchFn = dispatchNotification({ channels: notificationRegistry });
  startNotifications({ bus, dispatch: dispatchFn, recipients: recipientResolver })();

  // Оплата → подтверждение брони + событие payment.succeeded (для уведомлений).
  const onPaidFn = async (orgId: string, reservationId: string, amountMinor: number, currency: string) => {
    await confirmReservationFn(orgId, reservationId);
    bus.publish({ type: 'payment.succeeded', orgId, reservationId, amountMinor, currency });
  };

  const app = buildApp({
    requireAuth,
    readOnlyGate: createReadOnlyGate((orgId) => subscriptionRepo.getByOrg(orgId)),
    auth: authRoutes,
    property: {
      repo: propertyRepo,
      idGen: () => randomUUID(),
      clock,
      onContentChanged,
    },
    channel: {
      publishListings: publish,
      feedHost,
      connectChannel: connectChannel(manageDeps),
      listChannels: listChannels(manageDeps),
      disconnectChannel: disconnectChannel(manageDeps),
      reconnectChannel: reconnectChannel(manageDeps),
      deleteChannel: deleteChannel(manageDeps),
      handleWebhook: handleWebhookFn,
      listMessages: (orgId) => messageStore.listByOrg(orgId),
      subscribeMessages: realtime.subscribe,
      replyToThread: replyToThreadFn,
    },
    listing: {
      createManaged: createManagedListing(listingDeps),
      attach: attachListing(listingDeps),
      listForProperty: listPropertyListings(listingDeps),
      remove: removeListing(listingDeps),
    },
    calendar: {
      getCalendar: getCalendar({ properties: propertyRepo, holds: calendarHolds, prices: calendarPrices }),
    },
    availability: {
      createBlock: createBlock(blockDeps),
      removeBlock: removeBlock(blockDeps),
    },
    reservation: {
      createReservation: createReservation(reservationDeps),
      cancelReservation: cancelReservation(reservationDeps),
      listForProperty: listPropertyReservations({ reservations: reservationRepo }),
    },
    pricing: {
      getPropertyPricing: getPropertyPricing(pricingDeps),
      createRule: createPriceRule({ rules: priceRuleRepo, idGen: () => randomUUID() }),
      removeRule: removePriceRule({ rules: priceRuleRepo, idGen: () => randomUUID() }),
      setOverride: setPriceOverride({ overrides: priceOverrideRepo }),
      removeOverride: removePriceOverride({ overrides: priceOverrideRepo }),
      quote: getStayQuote({
        rules: priceRuleRepo,
        overrides: priceOverrideRepo,
        properties: {
          get: async (orgId, propertyId) => {
            const p = await propertyRepo.getById(orgId, propertyId);
            return p ? { basePriceMinor: p.basePriceMinor, currency: p.currency } : null;
          },
        },
        clock,
      }),
    },
    payment: {
      listProviders: listProviders(paymentManageDeps),
      listAccounts: listProviderAccounts(paymentManageDeps),
      connectProvider: connectProvider(paymentManageDeps),
      disconnectProvider: disconnectProvider(paymentManageDeps),
      buildDirectPlan: buildDirectPlan({
        plans: paymentPlans,
        registry: paymentRegistry,
        idGen: () => randomUUID(),
      }),
      initPayment: (orgId, input) => initPaymentFn(orgId, input, `${WEB_BASE_URL}/payment/return`),
      confirmManual: confirmManualPayment({
        registry: paymentRegistry,
        plans: paymentPlans,
        payments: paymentRepo,
        audit: paymentAudit,
        idGen: () => randomUUID(),
        clock,
      }),
      listReservationPayments: listReservationPayments({ payments: paymentRepo }),
      handleWebhook: handlePaymentWebhook({
        registry: paymentRegistry,
        accounts: paymentAccounts,
        payments: paymentRepo,
        plans: paymentPlans,
        inbox: paymentInbox,
        onPaid: onPaidFn, // оплата → подтвердить бронь + событие payment.succeeded
      }),
    },
    guest: guestDeps,
    cleaning: {
      listBoard: listCleaningBoard({ tasks: cleaningRepo }),
      listMine: listMyCleaning({ tasks: cleaningRepo }),
      listCleaners: async (orgId: string) =>
        (await users.listByOrg(orgId)).filter((u) => u.role === 'cleaner').map((u) => ({ id: u.id, email: u.email })),
      create: createCleaning(cleaningManageDeps),
      assign: assignCleaning(cleaningManageDeps),
      start: startCleaning(cleaningManageDeps),
      complete: completeCleaning(cleaningManageDeps),
    },
    notification: {
      feed: getNotificationFeed({ repo: notificationRepo }),
      markRead: markNotificationRead({ repo: notificationRepo }),
      markAllRead: markAllNotificationsRead({ repo: notificationRepo }),
    },
    reports: {
      getReport: getReport({
        properties: {
          list: async (orgId) =>
            (await propertyRepo.list(orgId)).map((p) => ({ id: p.id, name: p.title, currency: p.currency })),
        },
        reservations: {
          listConfirmed: async (orgId) =>
            (await reservationRepo.listConfirmedByOrg(orgId)).map((r) => ({
              propertyId: r.propertyId,
              checkIn: r.checkIn,
              checkOut: r.checkOut,
              amountMinor: r.amountMinor,
            })),
        },
      }),
    },
    commissions: {
      listRules: listCommissionRules({ rules: commissionRuleRepo }),
      setRule: setCommissionRule({ rules: commissionRuleRepo }),
      getReport: getCommissionReport({
        rules: commissionRuleRepo,
        reservations: {
          listConfirmed: async (orgId) =>
            (await reservationRepo.listConfirmedByOrg(orgId)).map((r) => ({
              source: r.source,
              checkIn: r.checkIn,
              amountMinor: r.amountMinor,
              currency: r.currency,
            })),
        },
      }),
    },
    subscription: {
      subscribeToPlan: subscribeToPlanFn,
      getSubscription: async (orgId) => {
        const sub = await subscriptionRepo.getByOrg(orgId);
        return sub ? toSubscriptionView(sub) : null;
      },
      getPlans: () => planRepo.list(),
      pay: payFn,
      confirmCardSetup: confirmCardSetupFn,
    },
  });

  const root = new Hono().use('*', cors()).route('/api', app);

  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: root.fetch, port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(`API on http://localhost:${info.port}`);
  });
};

void main();
