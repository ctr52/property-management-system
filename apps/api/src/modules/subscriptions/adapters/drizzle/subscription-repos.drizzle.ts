import { and, eq, lte } from 'drizzle-orm';
import type { Db } from '../../../../db/client';
import { cardLedger, cardSetupIntents, subscriptions, trialEligibilityLedger } from '../../../../db/schema';
import type { Subscription, SubscriptionStatus } from '../../domain/subscription';
import type {
  CardLedger,
  CardSetupIntent,
  CardSetupIntentRepo,
  SubscriptionRepo,
  TrialEligibilityLedger,
} from '../../ports/repos';

type SubscriptionRow = typeof subscriptions.$inferSelect;

const toSubscription = (row: SubscriptionRow): Subscription => ({
  orgId: row.orgId,
  planId: row.planId,
  status: row.status as SubscriptionStatus,
  trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
  paymentMethodAttached: row.paymentMethodAttached,
  billingMethodRef: row.billingMethodRef,
  everPaid: row.everPaid,
  currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
});

export const createDrizzleSubscriptionRepo = (db: Db): SubscriptionRepo => ({
  getByOrg: async (orgId) => {
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
    const row = rows[0];
    return row ? toSubscription(row) : null;
  },
  save: async (s) => {
    const values = {
      orgId: s.orgId,
      planId: s.planId,
      status: s.status,
      trialEndsAt: s.trialEndsAt ? new Date(s.trialEndsAt) : null,
      paymentMethodAttached: s.paymentMethodAttached,
      billingMethodRef: s.billingMethodRef,
      everPaid: s.everPaid,
      currentPeriodEnd: s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null,
      updatedAt: new Date(),
    };
    await db
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({ target: subscriptions.orgId, set: values });
  },
  listTrialingDueBy: async (nowIso) => {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'trialing'), lte(subscriptions.trialEndsAt, new Date(nowIso))));
    return rows.map(toSubscription);
  },
});

export const createDrizzleTrialEligibilityLedger = (db: Db): TrialEligibilityLedger => ({
  hasUsedTrial: async (phoneE164) => {
    const rows = await db
      .select()
      .from(trialEligibilityLedger)
      .where(eq(trialEligibilityLedger.phoneE164, phoneE164));
    return rows.length > 0;
  },
  // Идемпотентно по phoneE164: первая запись не перетирается (onConflictDoNothing).
  markUsed: async (phoneE164, orgId, at) => {
    await db
      .insert(trialEligibilityLedger)
      .values({ phoneE164, orgId, usedAt: new Date(at) })
      .onConflictDoNothing();
  },
});

export const createDrizzleCardLedger = (db: Db): CardLedger => ({
  hasUsedTrial: async (cardFingerprint) => {
    const rows = await db.select().from(cardLedger).where(eq(cardLedger.cardFingerprint, cardFingerprint));
    return rows.length > 0;
  },
  markUsed: async (cardFingerprint, orgId, at) => {
    await db
      .insert(cardLedger)
      .values({ cardFingerprint, orgId, usedAt: new Date(at) })
      .onConflictDoNothing();
  },
});

type CardSetupIntentRow = typeof cardSetupIntents.$inferSelect;

const toIntent = (row: CardSetupIntentRow): CardSetupIntent => ({
  paymentId: row.paymentId,
  orgId: row.orgId,
  planId: row.planId,
  phoneE164: row.phoneE164,
  createdAt: row.createdAt.toISOString(),
});

export const createDrizzleCardSetupIntentRepo = (db: Db): CardSetupIntentRepo => ({
  save: async (intent) => {
    const values = {
      paymentId: intent.paymentId,
      orgId: intent.orgId,
      planId: intent.planId,
      phoneE164: intent.phoneE164,
      createdAt: new Date(intent.createdAt),
    };
    await db
      .insert(cardSetupIntents)
      .values(values)
      .onConflictDoUpdate({ target: cardSetupIntents.paymentId, set: values });
  },
  getByPaymentId: async (paymentId) => {
    const rows = await db.select().from(cardSetupIntents).where(eq(cardSetupIntents.paymentId, paymentId));
    const row = rows[0];
    return row ? toIntent(row) : null;
  },
});
