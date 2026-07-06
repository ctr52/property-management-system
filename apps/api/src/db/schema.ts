import { boolean, date, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Схема БД (PostgreSQL через PGlite). Источник миграций для drizzle-kit.
 * Доменные типы живут отдельно (@pms/shared / модули); здесь только хранилище.
 */

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // 'owner' | 'manager' | 'cleaner'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// id = SHA-256 хеш сессионного токена (сырой токен в БД не хранится).
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  title: text('title').notNull(),
  address: text('address').notNull(),
  basePriceMinor: integer('base_price_minor').notNull(),
  currency: text('currency').notNull(),
  // Время заезда/выезда (HH:MM). default → существующие строки заполнятся при ALTER.
  checkInTime: text('check_in_time').notNull().default('14:00'),
  checkOutTime: text('check_out_time').notNull().default('12:00'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  propertyId: uuid('property_id').notNull(),
  checkIn: date('check_in').notNull(),
  checkOut: date('check_out').notNull(),
  guestName: text('guest_name').notNull(),
  guestContact: text('guest_contact'),
  source: text('source').notNull(), // 'direct' | 'avito' | 'cian'
  externalId: text('external_id'), // идемпотентность для каналов
  status: text('status').notNull(), // 'confirmed' | 'cancelled'
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  holdId: uuid('hold_id'), // hold доступности, которым владеет бронь
  guestToken: text('guest_token').notNull().default(''), // токен гостевой страницы
  accessCode: text('access_code').notNull().default(''), // код доступа (раскрывается при confirmed)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Единый источник занятости: бронь/блок/уборка как полуоткрытый интервал ночей [from, to).
// Инвариант «не пересекаются на объекте» обеспечивается атомарным insertIfFree (app-level lock).
export const availabilityHolds = pgTable('availability_holds', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  propertyId: uuid('property_id').notNull(),
  fromDate: date('from_date').notNull(), // включительно (заезд)
  toDate: date('to_date').notNull(), // исключительно (выезд)
  kind: text('kind').notNull(), // 'reservation' | 'block' | 'cleaning'
  // Тир: 'firm' (по умолчанию, жёсткий) | 'tentative' (мягкий, с TTL, вытесняемый).
  tier: text('tier').notNull().default('firm'),
  // Срок жизни tentative-холда; null = без срока (для firm/block/cleaning).
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  refId: uuid('ref_id'), // бронь/блок/уборка, к которой относится
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const channelAccounts = pgTable('channel_accounts', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  platform: text('platform').notNull(), // 'avito' | 'cian'
  status: text('status').notNull(), // 'active' | 'disabled'
  credentialsRef: text('credentials_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const listingLinks = pgTable('listing_links', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  propertyId: uuid('property_id').notNull(),
  platform: text('platform').notNull(), // 'avito' | 'cian'
  mode: text('mode').notNull(), // 'managed' | 'attached'
  externalId: text('external_id').notNull(),
  platformListingId: text('platform_listing_id'),
  phase: text('phase').notNull(), // 'queued' | 'pushed' | 'applied' | 'error'
  desiredRevision: integer('desired_revision').notNull(),
  pushedRevision: integer('pushed_revision'),
  appliedRevision: integer('applied_revision'),
  lastPushedAt: timestamp('last_pushed_at', { withTimezone: true }),
  lastConfirmedAt: timestamp('last_confirmed_at', { withTimezone: true }),
  lastError: text('last_error'),
});

// --- Pricing: правила (сезон/выходные/день недели/наценка канала) + ручные оверрайды по датам ---
export const priceRules = pgTable('price_rules', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  propertyId: uuid('property_id').notNull(),
  label: text('label').notNull(),
  priority: integer('priority').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  match: jsonb('match').notNull(),
  adjustment: jsonb('adjustment').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Ручная цена на дату. id = `${orgId}:${propertyId}:${date}` (upsert по дате).
export const priceOverrides = pgTable('price_overrides', {
  id: text('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  propertyId: uuid('property_id').notNull(),
  date: date('date').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// Durable outbox синка доступности в каналы: на availability.changed кладём задачу,
// воркер дренирует с ретраями. Гарантия at-least-once вместо fire-and-forget.
// Один pending-таск на (orgId, propertyId) — id = `${orgId}:${propertyId}` (дедуп через upsert).
export const availabilitySyncOutbox = pgTable('availability_sync_outbox', {
  id: text('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  propertyId: uuid('property_id').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Персистентное хранилище секретов (API-ключи площадок и провайдеров оплаты).
// ref → непрозрачный json. Заменяемо на внешний secret manager за тем же портом.
export const secrets = pgTable('secrets', {
  ref: text('ref').primaryKey(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Unified inbox: нормализованные входящие сообщения со всех площадок.
export const channelMessages = pgTable('channel_messages', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  platform: text('platform').notNull(),
  externalThreadId: text('external_thread_id').notNull(),
  externalMessageId: text('external_message_id').notNull(),
  direction: text('direction').notNull(), // 'in' | 'out'
  text: text('text').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
});

// Маппинг внутреннего id диалога ↔ реальный тред площадки (platform + externalThreadId).
// Наружу (URL, фронт) торчит только наш id; площадочные id спрятаны здесь.
export const channelThreads = pgTable(
  'channel_threads',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id').notNull(),
    platform: text('platform').notNull(),
    externalThreadId: text('external_thread_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    // Один диалог на (орга, площадка, внешний тред) — основа идемпотентного ensure.
    uq: unique('channel_threads_org_platform_thread').on(t.orgId, t.platform, t.externalThreadId),
  }),
);

// Идемпотентный приём входящих событий каналов (дедуп по ключу).
export const channelInbox = pgTable('channel_inbox', {
  key: text('key').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Хостинг фида аккаунта (площадка тянет pull'ом). Персистентно, чтобы фид пережил рестарт.
export const channelFeeds = pgTable('channel_feeds', {
  accountId: uuid('account_id').primaryKey(),
  contentType: text('content_type').notNull(),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// --- Payments (ADR-0001/0002): persistence вместо in-memory ---
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  reservationId: uuid('reservation_id').notNull(),
  legId: text('leg_id').notNull(),
  provider: text('provider').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  externalId: text('external_id'),
  refundedMinor: integer('refunded_minor').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// План оплаты брони (legs) — структурный объект в jsonb. id = `${orgId}:${reservationId}`.
export const paymentPlans = pgTable('payment_plans', {
  id: text('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  reservationId: uuid('reservation_id').notNull(),
  plan: jsonb('plan').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const paymentAccounts = pgTable('payment_accounts', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  provider: text('provider').notNull(),
  status: text('status').notNull(),
  credentialsRef: text('credentials_ref'),
  config: jsonb('config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const paymentInbox = pgTable('payment_inbox', {
  key: text('key').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Операции/клининг: задача уборки (turnover) от выезда. reservationId уникален (идемпотентность
// авто-генерации); null для ручных задач.
export const cleaningTasks = pgTable('cleaning_tasks', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  propertyId: uuid('property_id').notNull(),
  reservationId: uuid('reservation_id').unique(),
  date: date('date').notNull(), // дата уборки (= дата выезда)
  status: text('status').notNull().default('todo'),
  assigneeId: uuid('assignee_id'),
  guestName: text('guest_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// In-app уведомления пользователя. idempotencyKey уникален → дедуп при повторе события.
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  read: boolean('read').notNull().default(false),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// Комиссия площадки per-channel. id = `${orgId}:${source}` (upsert по каналу).
// percentBips — базисные пункты (целое: 1% = 100), деньги без float.
export const commissionRules = pgTable('commission_rules', {
  id: text('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  source: text('source').notNull(), // 'direct' | 'avito' | 'cian'
  percentBips: integer('percent_bips').notNull().default(0),
  fixedMinor: integer('fixed_minor').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// Сквозной audit log: денежные/чувствительные действия должны быть прослеживаемы.
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

// --- Подписки (SaaS-биллинг тенанта). Планы — конфиг (не таблица). ---

// Подписка организации: одна на org (pk = orgId).
export const subscriptions = pgTable('subscriptions', {
  orgId: uuid('org_id').primaryKey(),
  planId: text('plan_id').notNull(),
  status: text('status').notNull(), // 'trialing' | 'active' | 'expired' | 'canceled'
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  paymentMethodAttached: boolean('payment_method_attached').notNull().default(false),
  billingMethodRef: text('billing_method_ref'),
  everPaid: boolean('ever_paid').notNull().default(false),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// Реестр использования триала телефонами (cross-tenant): один номер E.164 = один cardless-триал.
export const trialEligibilityLedger = pgTable('trial_eligibility_ledger', {
  phoneE164: text('phone_e164').primaryKey(),
  orgId: uuid('org_id').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull(),
});

// Реестр использованных карт (cross-tenant): одна карта (псевдо-отпечаток) = один триал.
export const cardLedger = pgTable('card_ledger', {
  cardFingerprint: text('card_fingerprint').primaryKey(),
  orgId: uuid('org_id').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull(),
});

// Отложенная привязка карты (require_card_first): ждём подтверждения auth-hold по вебхуку.
export const cardSetupIntents = pgTable('card_setup_intents', {
  paymentId: text('payment_id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  planId: text('plan_id').notNull(),
  phoneE164: text('phone_e164').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
