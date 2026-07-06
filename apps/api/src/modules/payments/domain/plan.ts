import { err, ok, type Result } from 'neverthrow';
import type { PaymentLeg, PaymentPlan, PaymentProvider } from '@pms/shared';
import type { PaymentError } from './types';

/**
 * Чистое ядро сборки плана оплаты.
 *
 * Площадко-специфичную раскладку (что собирает Циан/Авито) даёт адаптер канала через свою
 * `paymentPolicy` (см. ADR-0001) — здесь её НЕТ. Эта функция лишь достраивает остаток,
 * который собираем мы, в provider-ногу. Так payments не знает ни про одну площадку.
 *
 * Инварианты: сумма ног == totalMinor, остаток не отрицателен.
 */
export const buildPlanWithRemainder = (params: {
  readonly reservationId: string;
  readonly currency: string;
  readonly totalMinor: number;
  /** Ноги, которые собирает площадка (collector.kind === 'channel'). */
  readonly channelLegs: readonly PaymentLeg[];
  readonly provider: PaymentProvider;
  readonly newLegId: () => string;
}): Result<PaymentPlan, PaymentError> => {
  const collected = params.channelLegs.reduce((sum, leg) => sum + leg.amountMinor, 0);
  const remainder = params.totalMinor - collected;

  if (remainder < 0) {
    return err({
      code: 'amount_mismatch',
      message: `Площадка собирает больше суммы брони: ${collected} > ${params.totalMinor}`,
    });
  }

  const providerLeg: readonly PaymentLeg[] =
    remainder === 0
      ? []
      : [
          {
            id: params.newLegId(),
            purpose: 'balance',
            amountMinor: remainder,
            currency: params.currency,
            collector: { kind: 'provider', provider: params.provider },
            status: 'pending',
            paymentId: null,
          },
        ];

  return ok({
    reservationId: params.reservationId,
    currency: params.currency,
    totalMinor: params.totalMinor,
    legs: [...params.channelLegs, ...providerLeg],
  });
};
