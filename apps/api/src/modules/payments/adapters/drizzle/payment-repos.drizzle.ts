import { and, eq } from 'drizzle-orm';
import type { PaymentPlan, PaymentProvider, PaymentStatus } from '@pms/shared';
import type { Db } from '../../../../db/client';
import {
  paymentAccounts,
  paymentInbox,
  paymentPlans,
  payments,
} from '../../../../db/schema';
import type { Payment } from '../../domain/types';
import type { PaymentAccount } from '../../ports/provider';
import type {
  PaymentAccountRepo,
  PaymentInbox,
  PaymentPlanRepo,
  PaymentRepo,
} from '../../ports/repos';

// --- Payments ---

type PaymentRow = typeof payments.$inferSelect;

const toPayment = (row: PaymentRow): Payment => ({
  id: row.id,
  orgId: row.orgId,
  reservationId: row.reservationId,
  legId: row.legId,
  provider: row.provider as PaymentProvider,
  amountMinor: row.amountMinor,
  currency: row.currency,
  status: row.status as PaymentStatus,
  idempotencyKey: row.idempotencyKey,
  externalId: row.externalId,
  refundedMinor: row.refundedMinor,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const createDrizzlePaymentRepo = (db: Db): PaymentRepo => ({
  getById: async (orgId, id) => {
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.orgId, orgId)));
    const row = rows[0];
    return row ? toPayment(row) : null;
  },
  getByExternalId: async (provider, externalId) => {
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, provider), eq(payments.externalId, externalId)));
    const row = rows[0];
    return row ? toPayment(row) : null;
  },
  getByLeg: async (legId) => {
    const rows = await db.select().from(payments).where(eq(payments.legId, legId));
    const row = rows[0];
    return row ? toPayment(row) : null;
  },
  listByReservation: async (orgId, reservationId) => {
    const rows = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.reservationId, reservationId)));
    return rows.map(toPayment);
  },
  save: async (payment) => {
    const values = {
      id: payment.id,
      orgId: payment.orgId,
      reservationId: payment.reservationId,
      legId: payment.legId,
      provider: payment.provider,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
      idempotencyKey: payment.idempotencyKey,
      externalId: payment.externalId,
      refundedMinor: payment.refundedMinor,
      createdAt: new Date(payment.createdAt),
      updatedAt: new Date(payment.updatedAt),
    };
    await db
      .insert(payments)
      .values(values)
      .onConflictDoUpdate({
        target: payments.id,
        set: {
          status: values.status,
          externalId: values.externalId,
          refundedMinor: values.refundedMinor,
          updatedAt: values.updatedAt,
        },
      });
  },
});

// --- Payment plans (jsonb) ---

const planKey = (orgId: string, reservationId: string) => `${orgId}:${reservationId}`;

export const createDrizzlePaymentPlanRepo = (db: Db): PaymentPlanRepo => ({
  getByReservation: async (orgId, reservationId) => {
    const rows = await db
      .select()
      .from(paymentPlans)
      .where(eq(paymentPlans.id, planKey(orgId, reservationId)));
    const row = rows[0];
    return row ? (row.plan as PaymentPlan) : null;
  },
  save: async (orgId, plan) => {
    await db
      .insert(paymentPlans)
      .values({
        id: planKey(orgId, plan.reservationId),
        orgId,
        reservationId: plan.reservationId,
        plan,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: paymentPlans.id,
        set: { plan, updatedAt: new Date() },
      });
  },
});

// --- Payment accounts ---

type AccountRow = typeof paymentAccounts.$inferSelect;

const toAccount = (row: AccountRow): PaymentAccount => ({
  id: row.id,
  orgId: row.orgId,
  provider: row.provider as PaymentProvider,
  status: row.status as PaymentAccount['status'],
  credentialsRef: row.credentialsRef,
  config: row.config as Record<string, string>,
  createdAt: row.createdAt.toISOString(),
});

export const createDrizzlePaymentAccountRepo = (db: Db): PaymentAccountRepo => ({
  getById: async (id) => {
    const rows = await db.select().from(paymentAccounts).where(eq(paymentAccounts.id, id));
    const row = rows[0];
    return row ? toAccount(row) : null;
  },
  listByOrg: async (orgId) => {
    const rows = await db.select().from(paymentAccounts).where(eq(paymentAccounts.orgId, orgId));
    return rows.map(toAccount);
  },
  listAll: async () => {
    const rows = await db.select().from(paymentAccounts);
    return rows.map(toAccount);
  },
  save: async (account) => {
    const values = {
      id: account.id,
      orgId: account.orgId,
      provider: account.provider,
      status: account.status,
      credentialsRef: account.credentialsRef,
      config: account.config,
      createdAt: new Date(account.createdAt),
    };
    await db
      .insert(paymentAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: paymentAccounts.id,
        set: { status: values.status, credentialsRef: values.credentialsRef, config: values.config },
      });
  },
});

// --- Payment inbox (дедуп входящих платёжных событий) ---

export const createDrizzlePaymentInbox = (db: Db): PaymentInbox => ({
  append: async (key) => {
    const existing = await db
      .select({ key: paymentInbox.key })
      .from(paymentInbox)
      .where(eq(paymentInbox.key, key));
    if (existing.length > 0) return { deduped: true };
    await db.insert(paymentInbox).values({ key, createdAt: new Date() }).onConflictDoNothing();
    return { deduped: false };
  },
});
