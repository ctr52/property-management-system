import { useState } from 'react';
import type { SubscriptionStatus, SubscriptionView } from '../../entities/subscription';
import { useCan } from '../../entities/auth';
import { usePlans, useSubscription } from '../../entities/subscription';
import { useSubscribe } from '../../features/manage-subscription/useSubscribe';
import { usePay } from '../../features/manage-subscription/usePay';
import { Button, Card, Input, Select, Stack, Text } from '../../shared/ui';

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Пробный период',
  active: 'Активна',
  expired: 'Истёк (только чтение)',
  canceled: 'Отменена (только чтение)',
};

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');

/** Целых дней до даты (вверх). Отрицательные → 0. */
const daysUntil = (iso: string): number =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

const StatusLine = ({ sub }: { sub: SubscriptionView }) => {
  return (
    <Stack gap={1}>
      <Stack direction="row" gap={2} align="center">
        <Text weight={600}>Статус:</Text>
        <Text css={(t) => (sub.readOnly ? { color: t.colors.danger } : {})}>
          {STATUS_LABEL[sub.status]}
        </Text>
      </Stack>
      {sub.status === 'trialing' && sub.trialEndsAt && (
        <Text muted size="sm">
          Триал до {formatDate(sub.trialEndsAt)} · осталось {daysUntil(sub.trialEndsAt)} дн.
        </Text>
      )}
      {sub.status === 'active' && sub.currentPeriodEnd && (
        <Text muted size="sm">
          Оплачено до {formatDate(sub.currentPeriodEnd)}
        </Text>
      )}
    </Stack>
  );
};

/** Форма входа в подписку/оплаты: выбор тарифа + подтверждённый телефон (E.164). org:manage. */
const SubscribeForm = () => {
  const plans = usePlans(true);
  const subscribe = useSubscribe();
  const [planId, setPlanId] = useState('');
  const [phone, setPhone] = useState('');

  const result = subscribe.data;
  const selectedPlan = (plans.data ?? []).find((p) => p.id === planId);
  const effectivePlanId = planId || plans.data?.[0]?.id || '';

  return (
    <Card>
      <Stack
        as="form"
        gap={3}
        onSubmit={(e) => {
          e.preventDefault();
          if (effectivePlanId && phone) subscribe.mutate({ planId: effectivePlanId, phoneE164: phone });
        }}
      >
        <Text weight={600}>Оформить подписку</Text>

        {plans.isLoading && <Text muted>Загрузка тарифов…</Text>}
        {plans.data && (
          <Stack gap={1}>
            <Text size="sm" muted>
              Тариф
            </Text>
            <Select value={effectivePlanId} onChange={(e) => setPlanId(e.target.value)}>
              {plans.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.priceMinor, p.currency)}/мес · триал {p.trialDays} дн.
                </option>
              ))}
            </Select>
          </Stack>
        )}

        <Stack gap={1}>
          <Text size="sm" muted>
            Телефон (подтверждается звонком)
          </Text>
          <Input
            type="tel"
            placeholder="+79991234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Stack>

        <Stack direction="row" gap={2} align="center">
          <Button type="submit" disabled={subscribe.isPending || !phone || !effectivePlanId}>
            {selectedPlan && selectedPlan.priceMinor > 0 ? 'Начать пробный период' : 'Подписаться'}
          </Button>
          {subscribe.isPending && <Text muted size="sm">Отправляем…</Text>}
        </Stack>

        {subscribe.isError && (
          <Text size="sm" css={(t) => ({ color: t.colors.danger })}>
            Не удалось оформить. Попробуйте ещё раз.
          </Text>
        )}
        {result?.kind === 'rejected' && (
          <Text size="sm" css={(t) => ({ color: t.colors.danger })}>
            {result.reason}
          </Text>
        )}
        {result?.kind === 'trial_started' && (
          <Text size="sm" css={(t) => ({ color: t.colors.link })}>
            Пробный период активирован.
          </Text>
        )}
      </Stack>
    </Card>
  );
};

/** Текст CTA оплаты под статус: продление триала/active или реактивация из read-only. */
const PAY_COPY: Record<SubscriptionStatus, { title: string; hint: string; cta: string }> = {
  trialing: {
    title: 'Оплатить подписку',
    hint: 'Оплатите период сейчас — он добавится к дате окончания триала, остаток пробных дней не сгорит.',
    cta: 'Оплатить',
  },
  active: {
    title: 'Продлить подписку',
    hint: 'Оплатите ещё период — он добавится к текущей дате «оплачено до».',
    cta: 'Продлить',
  },
  expired: {
    title: 'Возобновить подписку',
    hint: 'Оплатите, чтобы снять режим только для чтения. Карта на файле — спишем сразу, иначе откроется привязка карты.',
    cta: 'Оплатить',
  },
  canceled: {
    title: 'Возобновить подписку',
    hint: 'Оплатите, чтобы снова активировать подписку. Карта на файле — спишем сразу, иначе откроется привязка карты.',
    cta: 'Оплатить',
  },
};

/** CTA оплаты периода: одна кнопка, путь (списание/привязка карты) и семантику выбирает сервер. */
const PayPanel = ({ sub }: { sub: SubscriptionView }) => {
  const pay = usePay();
  const copy = PAY_COPY[sub.status];
  return (
    <Card>
      <Stack gap={2}>
        <Text weight={600}>{copy.title}</Text>
        <Text size="sm" muted>
          {copy.hint}
        </Text>
        <Stack direction="row" gap={2} align="center">
          <Button disabled={pay.isPending} onClick={() => pay.mutate()}>
            {copy.cta}
          </Button>
          {pay.isPending && <Text muted size="sm">Переходим к оплате…</Text>}
        </Stack>
        {pay.isError && (
          <Text size="sm" css={(t) => ({ color: t.colors.danger })}>
            Не удалось оплатить. Попробуйте ещё раз.
          </Text>
        )}
        {pay.data?.kind === 'declined' && (
          <Text size="sm" css={(t) => ({ color: t.colors.danger })}>
            Карта отклонена. Привяжите другую карту и попробуйте снова.
          </Text>
        )}
        {pay.data?.kind === 'paid' && (
          <Text size="sm" css={(t) => ({ color: t.colors.link })}>
            Оплата прошла. Дата окончания продлена.
          </Text>
        )}
      </Stack>
    </Card>
  );
};

/**
 * Панель подписки (SaaS-биллинг тенанта): статус + действие. Самодостаточна — сама читает
 * подписку и тарифы. Действия видны только org:manage; статус — всем. Нет подписки → форма триала;
 * есть подписка → оплата периода (продление триала/active или реактивация из read-only).
 */
export const SubscriptionPanel = () => {
  const canManage = useCan()('org:manage');
  const sub = useSubscription();

  return (
    <Stack gap={3}>
      {sub.isLoading && <Text muted>Загрузка…</Text>}
      {sub.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки подписки</Text>}

      {sub.data && (
        <Card>
          <StatusLine sub={sub.data} />
        </Card>
      )}

      {canManage && !sub.data && <SubscribeForm />}
      {canManage && sub.data && <PayPanel sub={sub.data} />}
    </Stack>
  );
};
