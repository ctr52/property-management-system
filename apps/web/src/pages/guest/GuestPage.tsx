import type { GuestView } from '@pms/shared';
import { useGuestView } from '../../entities/guest';
import { useGuestPay } from '../../features/guest/useGuestPay';
import { Button, Card, Heading, Stack, Text } from '../../shared/ui';

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(minor / 100);

const statusLabel: Record<GuestView['status'], string> = {
  pending: 'Ожидает оплаты',
  confirmed: 'Подтверждено',
  cancelled: 'Отменено',
  conflict: 'Требует уточнения',
  expired: 'Срок истёк',
  preempted: 'Даты заняты',
};

/** Публичная страница гостя (без авторизации, доступ по токену). */
export const GuestPage = ({ token }: { token: string }) => {
  const guest = useGuestView(token);
  const pay = useGuestPay(token);

  return (
    <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 560, margin: '40px auto' }}>
      <Heading>Ваше бронирование</Heading>

      {guest.isLoading && <Text muted>Загрузка…</Text>}
      {guest.isError && <Text css={(t) => ({ color: t.colors.danger })}>Бронь не найдена</Text>}

      {guest.data && (
        <>
          <Card>
            <Stack gap={1}>
              <Text size="lg" weight={600}>
                {guest.data.property.title}
              </Text>
              <Text muted>{guest.data.property.address}</Text>
              <Text>
                {guest.data.guestName} · {guest.data.checkIn} → {guest.data.checkOut}
              </Text>
              <Text size="sm" muted>
                Заезд с {guest.data.property.checkInTime} · Выезд до {guest.data.property.checkOutTime}
              </Text>
              <Text weight={600}>Статус: {statusLabel[guest.data.status]}</Text>
            </Stack>
          </Card>

          {guest.data.accessCode && (
            <Card css={(t) => ({ background: t.colors.surface })}>
              <Stack gap={1}>
                <Text size="sm" muted>
                  Код доступа (показан после подтверждения)
                </Text>
                <Text size="lg" weight={600}>
                  {guest.data.accessCode}
                </Text>
              </Stack>
            </Card>
          )}

          {guest.data.payable && (
            <Card>
              <Stack gap={2}>
                <Text>
                  К оплате: <b>{formatMoney(guest.data.payable.amountMinor, guest.data.payable.currency)}</b> ·{' '}
                  {guest.data.payable.provider}
                </Text>
                <Button
                  disabled={pay.isPending}
                  onClick={() =>
                    guest.data?.payable &&
                    pay.mutate(guest.data.payable.legId, {
                      onSuccess: (r) => {
                        window.location.href = r.redirectUrl;
                      },
                    })
                  }
                >
                  {pay.isPending ? 'Переходим к оплате…' : 'Оплатить'}
                </Button>
                {pay.isError && <Text css={(t) => ({ color: t.colors.danger })}>{pay.error.message}</Text>}
              </Stack>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
};
