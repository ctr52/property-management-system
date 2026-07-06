import { useState } from 'react';
import type { PaymentLeg, PaymentPlan, PaymentStatus, ReservationView } from '@pms/shared';
import { useCan } from '../../entities/auth';
import { usePaymentAccounts, useReservationPayments } from '../../entities/payment';
import {
  useBuildPlan,
  useConfirmManual,
  useInitPayment,
} from '../../features/manage-payments/usePayments';
import { Button, Card, Link, Select, Stack, Text } from '../../shared/ui';

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(minor / 100);

const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  created: 'создан',
  pending: 'ожидает оплаты',
  succeeded: 'оплачен',
  failed: 'ошибка',
  canceled: 'отменён',
  refunded: 'возврат',
  partially_refunded: 'частичный возврат',
};

const providerOfLeg = (leg: PaymentLeg): string | null =>
  leg.collector.kind === 'provider' ? leg.collector.provider : null;

/** Оплата брони: построить план (один provider-leg) → онлайн-оплата или ручное подтверждение. */
export const ReservationPayment = ({ reservation }: { reservation: ReservationView }) => {
  const canManage = useCan()('payment:manage');
  const payments = useReservationPayments(reservation.id);
  const accounts = usePaymentAccounts();
  const buildPlan = useBuildPlan(reservation.id);
  const initPayment = useInitPayment();
  const confirmManual = useConfirmManual(reservation.id);

  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [provider, setProvider] = useState('');

  const activeAccounts = (accounts.data ?? []).filter((a) => a.status === 'active');
  const selectedProvider = provider || activeAccounts[0]?.provider || '';

  const createPlan = () => {
    if (!selectedProvider) return;
    buildPlan.mutate(
      {
        reservationId: reservation.id,
        provider: selectedProvider,
        totalMinor: reservation.amountMinor,
        currency: reservation.currency,
      },
      { onSuccess: (p) => setPlan(p) },
    );
  };

  const pay = (leg: PaymentLeg) => {
    const prov = providerOfLeg(leg);
    if (prov === 'manual') {
      confirmManual.mutate({ reservationId: reservation.id, legId: leg.id });
      return;
    }
    initPayment.mutate(
      { reservationId: reservation.id, legId: leg.id },
      { onSuccess: (r) => { window.location.href = r.redirectUrl; } },
    );
  };

  return (
    <Card css={(t) => ({ background: t.colors.surface })}>
      <Stack gap={2}>
        <Text size="sm" weight={600}>
          Оплата · {formatMoney(reservation.amountMinor, reservation.currency)}
        </Text>

        {/* Уже существующие платежи */}
        {payments.data?.map((p) => (
          <Text key={p.id} size="sm" muted>
            {formatMoney(p.amountMinor, p.currency)} · {p.provider} · <b>{PAYMENT_STATUS[p.status]}</b>
          </Text>
        ))}

        {canManage && activeAccounts.length === 0 && (
          <Text size="sm" muted>
            Нет подключённых провайдеров — <Link to="/payments">подключить</Link>.
          </Text>
        )}

        {/* Построить план */}
        {canManage && activeAccounts.length > 0 && !plan && (
          <Stack direction="row" gap={2} align="center">
            <Select value={selectedProvider} onChange={(e) => setProvider(e.target.value)}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.provider}>
                  {a.title}
                </option>
              ))}
            </Select>
            <Button disabled={buildPlan.isPending} onClick={createPlan}>
              {buildPlan.isPending ? 'Создаём…' : 'Создать план'}
            </Button>
          </Stack>
        )}

        {/* Ноги плана → оплата */}
        {plan?.legs.map((leg) => (
          <Stack key={leg.id} direction="row" justify="space-between" align="center">
            <Text size="sm">
              {formatMoney(leg.amountMinor, leg.currency)} · {leg.purpose} · {leg.status}
            </Text>
            {canManage && leg.status !== 'paid' && (
              <Button
                disabled={initPayment.isPending || confirmManual.isPending}
                onClick={() => pay(leg)}
              >
                {providerOfLeg(leg) === 'manual' ? 'Подтвердить вручную' : 'Оплатить'}
              </Button>
            )}
          </Stack>
        ))}

        {(buildPlan.isError || initPayment.isError || confirmManual.isError) && (
          <Text css={(t) => ({ color: t.colors.danger })}>
            {buildPlan.error?.message ?? initPayment.error?.message ?? confirmManual.error?.message}
          </Text>
        )}

        <Text size="sm" muted>
          Гостевая ссылка:{' '}
          <Link to={`/guest/${reservation.guestToken}`} nativeHref={`/guest/${reservation.guestToken}`}>
            /guest/{reservation.guestToken.slice(0, 8)}…
          </Link>
        </Text>
      </Stack>
    </Card>
  );
};
