/**
 * Лёгкая in-process шина доменных событий — клей между модулями (low coupling):
 * издатель не знает подписчиков. Типобезопасная: subscribe сужает событие по type.
 * Расширяется добавлением вариантов в DomainEvent.
 *
 * Доставка at-most-once, fire-and-forget. Для критичных путей наружу используем durable outbox
 * (см. availability-sync); подписчики должны быть идемпотентны.
 */
export type DomainEvent =
  | { readonly type: 'availability.changed'; readonly orgId: string; readonly propertyId: string }
  | {
      readonly type: 'cleaning.created';
      readonly orgId: string;
      readonly taskId: string;
      readonly propertyId: string;
      readonly date: string;
    }
  | {
      readonly type: 'cleaning.assigned';
      readonly orgId: string;
      readonly taskId: string;
      readonly assigneeId: string;
      readonly propertyId: string;
      readonly date: string;
    }
  | {
      readonly type: 'payment.succeeded';
      readonly orgId: string;
      readonly reservationId: string;
      readonly amountMinor: number;
      readonly currency: string;
    };

export type EventType = DomainEvent['type'];
export type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;
export type EventHandler<T extends EventType> = (event: EventOf<T>) => Promise<void>;

export type EventBus = {
  readonly publish: (event: DomainEvent) => void;
  readonly subscribe: <T extends EventType>(type: T, handler: EventHandler<T>) => void;
};

export const createInMemoryEventBus = (): EventBus => {
  const handlers = new Map<EventType, EventHandler<EventType>[]>();
  return {
    publish: (event) => {
      for (const handler of handlers.get(event.type) ?? []) {
        // fire-and-forget: ошибка подписчика не валит публикатора и других подписчиков
        void handler(event).catch((error) => {
          // eslint-disable-next-line no-console
          console.error(`event handler failed for ${event.type}`, error);
        });
      }
    },
    subscribe: (type, handler) => {
      const list = handlers.get(type) ?? [];
      list.push(handler as unknown as EventHandler<EventType>);
      handlers.set(type, list);
    },
  };
};
