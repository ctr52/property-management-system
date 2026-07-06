import { randomUUID } from 'node:crypto';
import type { PaymentPlan, PaymentProvider } from '@pms/shared';
import type { Payment } from '../../domain/types';
import type { PaymentAccount } from '../../ports/provider';
import type {
  PaymentAccountRepo,
  PaymentInbox,
  PaymentPlanRepo,
  PaymentRepo,
  SecretVault,
} from '../../ports/repos';

/**
 * In-memory хранилища платежей. Persistence (таблица/проекция плана) осознанно отложена —
 * см. открытый вопрос ADR-0002 о месте хранения PaymentPlan/конфига аккаунта. Форма совпадает
 * с channel-репозиториями, переезд на Drizzle = смена адаптера за тем же портом.
 */
export const createInMemoryPaymentRepo = (): PaymentRepo => {
  const store = new Map<string, Payment>();
  return {
    getById: async (orgId, id) => {
      const p = store.get(id);
      return p && p.orgId === orgId ? p : null;
    },
    getByExternalId: async (provider: PaymentProvider, externalId) =>
      [...store.values()].find((p) => p.provider === provider && p.externalId === externalId) ?? null,
    getByLeg: async (legId) => [...store.values()].find((p) => p.legId === legId) ?? null,
    listByReservation: async (orgId, reservationId) =>
      [...store.values()].filter((p) => p.orgId === orgId && p.reservationId === reservationId),
    save: async (payment) => {
      store.set(payment.id, payment);
    },
  };
};

export const createInMemoryPaymentPlanRepo = (): PaymentPlanRepo => {
  const store = new Map<string, PaymentPlan>();
  const key = (orgId: string, reservationId: string) => `${orgId}:${reservationId}`;
  return {
    getByReservation: async (orgId, reservationId) => store.get(key(orgId, reservationId)) ?? null,
    save: async (orgId, plan) => {
      store.set(key(orgId, plan.reservationId), plan);
    },
  };
};

/** Дедуп входящих платёжных событий (идемпотентность inbox). */
export const createInMemoryPaymentInbox = (): PaymentInbox => {
  const seen = new Set<string>();
  return {
    append: async (key) => {
      if (seen.has(key)) return { deduped: true };
      seen.add(key);
      return { deduped: false };
    },
  };
};

export const createInMemoryPaymentAccountRepo = (): PaymentAccountRepo => {
  const store = new Map<string, PaymentAccount>();
  return {
    getById: async (id) => store.get(id) ?? null,
    listByOrg: async (orgId) => [...store.values()].filter((a) => a.orgId === orgId),
    listAll: async () => [...store.values()],
    save: async (account) => {
      store.set(account.id, account);
    },
  };
};

/** Заглушка vault (как у каналов): секреты в памяти. Заменить на реальный secret manager. */
export const createInMemoryPaymentVault = (): SecretVault => {
  const store = new Map<string, Record<string, string>>();
  return {
    put: async (secret) => {
      const ref = `pay:${randomUUID()}`;
      store.set(ref, { ...secret });
      return ref;
    },
    get: async (ref) => store.get(ref) ?? null,
  };
};
