import { err, ok, type Result } from 'neverthrow';
import type { PaymentStatus } from '@pms/shared';
import type { Payment, PaymentError } from './types';

/**
 * Жизненный цикл платежа. Чистая статусная машина — единственный источник правды
 * по легальным переходам. Нелегальный переход = Result.err, не throw.
 *
 *   created → pending → succeeded → (refunded | partially_refunded → refunded)
 *      └→ canceled/failed         └→ (terminal)
 */
const TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  created: ['pending', 'canceled', 'failed'],
  pending: ['succeeded', 'failed', 'canceled'],
  succeeded: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded', 'partially_refunded'],
  refunded: [],
  failed: [],
  canceled: [],
};

export const canTransition = (from: PaymentStatus, to: PaymentStatus): boolean =>
  TRANSITIONS[from].includes(to);

/** Перевести платёж в новый статус, если переход легален. */
export const transition = (payment: Payment, to: PaymentStatus): Result<Payment, PaymentError> =>
  canTransition(payment.status, to)
    ? ok({ ...payment, status: to })
    : err({
        code: 'invalid_transition',
        message: `Недопустимый переход платежа: ${payment.status} → ${to}`,
      });
