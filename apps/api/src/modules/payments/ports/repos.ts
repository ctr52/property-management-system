import type { Result } from 'neverthrow';
import type { PaymentLeg, PaymentPlan, PaymentProvider, Platform } from '@pms/shared';
import type { Payment, PaymentError, PaymentEvent } from '../domain/types';
import type { PaymentAccount, PaymentProviderAdapter } from './provider';

/**
 * Реестр адаптеров провайдеров (аналог AdapterRegistry каналов) — источник правды о множестве
 * рельсов вместо закрытого enum (ADR-0002). resolve по open string-id; list() питает
 * GET /payments/providers (манифесты).
 */
export type PaymentProviderRegistry = {
  readonly get: (provider: PaymentProvider) => PaymentProviderAdapter | undefined;
  readonly list: () => readonly PaymentProviderAdapter[];
};

export type PaymentRepo = {
  readonly getById: (orgId: string, id: string) => Promise<Payment | null>;
  readonly getByExternalId: (provider: PaymentProvider, externalId: string) => Promise<Payment | null>;
  readonly getByLeg: (legId: string) => Promise<Payment | null>;
  readonly listByReservation: (orgId: string, reservationId: string) => Promise<Payment[]>;
  readonly save: (payment: Payment) => Promise<void>;
};

/** Хранилище плана оплаты брони. */
export type PaymentPlanRepo = {
  readonly getByReservation: (orgId: string, reservationId: string) => Promise<PaymentPlan | null>;
  readonly save: (orgId: string, plan: PaymentPlan) => Promise<void>;
};

/**
 * Дедуп входящих платёжных событий (идемпотентность inbox). Robokassa дёргает ResultURL
 * повторно при таймауте — двойного зачисления быть не должно.
 */
export type PaymentInbox = {
  readonly append: (key: string, event: PaymentEvent) => Promise<{ readonly deduped: boolean }>;
};

export type PaymentAccountRepo = {
  readonly getById: (id: string) => Promise<PaymentAccount | null>;
  readonly listByOrg: (orgId: string) => Promise<PaymentAccount[]>;
  readonly listAll: () => Promise<PaymentAccount[]>;
  readonly save: (account: PaymentAccount) => Promise<void>;
};

/**
 * Хранилище секретов провайдеров. Совпадает по форме с SecretVault каналов —
 * кандидат на промо в shared/ports (см. ADR-0001, открытые вопросы).
 */
export type SecretVault = {
  readonly put: (secret: Readonly<Record<string, string>>) => Promise<string>;
  readonly get: (ref: string) => Promise<Record<string, string> | null>;
};

/**
 * Порт к каналам, нужный buildPaymentPlan: «как площадка делит сумму брони».
 * Реализуется в composition root поверх channel registry (адаптер канала декларирует
 * paymentPolicy). Payments зависит от ЭТОГО интерфейса, а не от модуля channel —
 * связь односторонняя и тонкая.
 */
export type ChannelSplitSource = {
  readonly split: (
    platform: Platform,
    booking: { readonly reservationId: string; readonly totalMinor: number; readonly currency: string },
  ) => Promise<Result<readonly PaymentLeg[], PaymentError>>;
};
