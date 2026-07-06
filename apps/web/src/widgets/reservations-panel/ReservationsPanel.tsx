import { useState, type FormEvent, type ReactNode } from 'react';
import type { ReservationSource, ReservationStatus } from '@pms/shared';
import { useCan } from '../../entities/auth';
import { useStayQuote, type StayQuote } from '../../entities/pricing';
import { usePropertyReservations } from '../../entities/reservation';
import {
  useCancelReservation,
  useCreateReservation,
} from '../../features/manage-reservation/useManageReservation';
import { ReservationPayment } from '../reservation-payment/ReservationPayment';
import { Button, Card, Input, Stack, Text } from '../../shared/ui';

const sourceLabel: Record<ReservationSource, string> = {
  direct: 'платформа',
  avito: 'Avito',
  cian: 'Cian',
};

const statusSuffix: Record<ReservationStatus, string> = {
  confirmed: '',
  pending: ' · ⏳ ожидает оплаты',
  cancelled: ' · отменена',
  conflict: ' · ⚠ конфликт (овербукинг)',
  expired: ' · ⌛ истекла',
  preempted: ' · вытеснена',
};

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(minor / 100);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Stack gap={1} css={{ flex: 1 }}>
    <Text size="sm" muted>
      {label}
    </Text>
    {children}
  </Stack>
);

/** Расчёт стоимости по тарифам (DSL) с кнопкой «подставить в сумму». */
const QuoteCard = ({
  data,
  onApply,
}: {
  data: StayQuote;
  onApply: (rub: number) => void;
}) => {
  const avgPerNight = Math.round(data.totalMinor / Math.max(1, data.nights));
  return (
    <Card css={(t) => ({ borderColor: t.colors.link })}>
      <Stack direction="row" justify="space-between" align="center" gap={2}>
        <Stack gap={1}>
          <Text size="sm" weight={600}>
            Расчёт по тарифам: {formatMoney(data.totalMinor, data.currency)}
          </Text>
          <Text size="sm" muted>
            {data.nights} ноч. · {formatMoney(avgPerNight, data.currency)} / ночь в среднем
          </Text>
        </Stack>
        <Button type="button" variant="secondary" onClick={() => onApply(data.totalMinor / 100)}>
          Подставить
        </Button>
      </Stack>
    </Card>
  );
};

const CreateForm = ({ propertyId }: { propertyId: string }) => {
  const create = useCreateReservation(propertyId);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestName, setGuestName] = useState('');
  const [amount, setAmount] = useState('');

  const quote = useStayQuote(propertyId, checkIn, checkOut);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      {
        propertyId,
        checkIn,
        checkOut,
        guestName,
        amountMinor: Math.round(Number(amount || 0) * 100),
        currency: 'RUB',
      },
      {
        onSuccess: () => {
          setCheckIn('');
          setCheckOut('');
          setGuestName('');
          setAmount('');
        },
      },
    );
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <Stack gap={2} css={{ maxWidth: 460 }}>
          <Text weight={600}>Создать бронь</Text>
          <Stack direction="row" gap={2}>
            <Field label="Заезд">
              <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
            </Field>
            <Field label="Выезд">
              <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
            </Field>
          </Stack>
          <Input placeholder="Имя гостя" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
          {quote.isFetching && (
            <Text size="sm" muted>
              Считаем стоимость по тарифам…
            </Text>
          )}
          {quote.data && (
            <QuoteCard data={quote.data} onApply={(rub) => setAmount(String(rub))} />
          )}
          <Input type="number" min="0" placeholder="Сумма, ₽" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Создаём…' : 'Забронировать'}
          </Button>
          {create.isError && <Text css={(t) => ({ color: t.colors.danger })}>{create.error.message}</Text>}
        </Stack>
      </form>
    </Card>
  );
};

/** Брони объекта: создание (с защитой от овербукинга) + список с отменой. */
export const ReservationsPanel = ({ propertyId }: { propertyId: string }) => {
  const canWrite = useCan()('property:write');
  const canSeePayments = useCan()('payment:read');
  const reservations = usePropertyReservations(propertyId);
  const cancel = useCancelReservation(propertyId);

  return (
    <Stack gap={3}>
      {canWrite && <CreateForm propertyId={propertyId} />}

      {reservations.isLoading && <Text>Загрузка…</Text>}
      {reservations.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}

      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {reservations.data?.map((r) => (
          <Card as="li" key={r.id}>
            <Stack gap={2}>
              <Stack direction="row" justify="space-between" align="center">
                <Stack gap={1}>
                  <Text weight={600}>
                    {r.guestName}
                    {statusSuffix[r.status]}
                  </Text>
                  <Text size="sm" muted>
                    {r.checkIn} → {r.checkOut} · {sourceLabel[r.source]} · {formatMoney(r.amountMinor, r.currency)}
                  </Text>
                </Stack>
                {canWrite && (r.status === 'confirmed' || r.status === 'pending') && (
                  <Button variant="secondary" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                    Отменить
                  </Button>
                )}
              </Stack>
              {canSeePayments && (r.status === 'confirmed' || r.status === 'pending') && (
                <ReservationPayment reservation={r} />
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};
