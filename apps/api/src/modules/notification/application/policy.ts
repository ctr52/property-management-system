import type { EventBus } from '../../../shared/event-bus';
import type { RecipientResolver } from '../ports';
import type { DispatchInput } from './dispatch';

export type NotificationPolicyDeps = {
  readonly bus: EventBus;
  readonly dispatch: (input: DispatchInput) => Promise<void>;
  readonly recipients: RecipientResolver;
};

/**
 * Политика уведомлений — единственное место, где доменные события превращаются в адресные
 * уведомления. Низкая связанность: издатели событий ничего не знают про уведомления.
 * Подписки идемпотентны (key) → повтор события не задвоит уведомление.
 */
export const startNotifications =
  (deps: NotificationPolicyDeps) =>
  (): void => {
    deps.bus.subscribe('cleaning.assigned', async (e) => {
      await deps.dispatch({
        orgId: e.orgId,
        recipients: [e.assigneeId],
        type: 'cleaning_assigned',
        title: 'Вам назначена уборка',
        body: `Объект ${e.propertyId}, дата ${e.date}`,
        key: `cleaning_assigned:${e.taskId}`,
        via: ['in_app'],
      });
    });

    deps.bus.subscribe('cleaning.created', async (e) => {
      await deps.dispatch({
        orgId: e.orgId,
        recipients: await deps.recipients.staffOf(e.orgId),
        type: 'cleaning_created',
        title: 'Новая задача уборки',
        body: `Объект ${e.propertyId}, дата ${e.date}`,
        key: `cleaning_created:${e.taskId}`,
        via: ['in_app'],
      });
    });

    deps.bus.subscribe('payment.succeeded', async (e) => {
      await deps.dispatch({
        orgId: e.orgId,
        recipients: await deps.recipients.staffOf(e.orgId),
        type: 'payment_succeeded',
        title: 'Оплата получена',
        body: `${(e.amountMinor / 100).toLocaleString('ru-RU')} ${e.currency}`,
        key: `payment_succeeded:${e.reservationId}:${e.amountMinor}`,
        via: ['in_app'],
      });
    });
  };
