import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { ChannelAccount, ChannelError, PublishConfirmation } from '../../domain/types';
import type { ChannelAdapter } from '../../ports/adapter';
import { buildCianFeed } from './cian-feed';
import {
  cianGetOrder,
  cianSendMessage,
  cianSubscribeWebhooks,
  cianUnsubscribeWebhooks,
  type CianOrderOffer,
} from './cian-client';
import { parseCianWebhook } from './cian-webhook';

export type CianAdapterDeps = {
  /** База API (прод `https://public-api.cian.ru`, дев — фейк `http://localhost:4000/cian`). */
  readonly apiBase: string;
  /** Интервал опроса get-order (прод ~часы; дев маленький для ручной проверки). */
  readonly feedbackPollSec: number;
  /** Достаёт ACCESS KEY аккаунта из vault по credentialsRef. */
  readonly resolveAccessKey: (account: ChannelAccount) => Promise<string | null>;
  /** Публичная база для построения webhook-URL при регистрации (`/api/webhooks/cian/:accountId`). */
  readonly publicBaseUrl: string;
};

const APPLIED_STATUSES = new Set(['Published']);
const REJECTED_STATUSES = new Set(['Refused', 'RemovedByModerator', 'Blocked', 'Deleted']);

/** Строка отчёта get-order → подтверждение (или null, если статус ещё не терминальный). */
const toConfirmation = (offer: CianOrderOffer): PublishConfirmation | null => {
  if (APPLIED_STATUSES.has(offer.status)) {
    return {
      externalId: offer.externalId,
      outcome: 'applied',
      platformListingId: offer.offerId !== undefined ? String(offer.offerId) : undefined,
    };
  }
  if (REJECTED_STATUSES.has(offer.status)) {
    return {
      externalId: offer.externalId,
      outcome: 'error',
      error: (offer.errors ?? []).join('; ') || `Статус: ${offer.status}`,
    };
  }
  return null; // Draft / Moderate / Deactivated — публикация ещё в процессе
};

/**
 * Cian: публикация — XML-фид (Циан 2.0, pull площадкой). Обратная связь по публикации —
 * опрос `GET /v1/get-order` (статус и ошибки по объектам, externalId → offerId), Reconciler
 * сводит подтверждения в ListingLink. Цена/доступность — только перевыкладкой фида.
 * Брони у Циана нет. Auth — `Bearer <ACCESS KEY>` (не OAuth), база `public-api.cian.ru`.
 */
export const createCianAdapter = (deps: CianAdapterDeps): ChannelAdapter => {
  const webhookUrlFor = (account: ChannelAccount) =>
    `${deps.publicBaseUrl}/api/webhooks/cian/${account.id}`;

  const register = async (account: ChannelAccount): Promise<void> => {
    const accessKey = await deps.resolveAccessKey(account);
    if (!accessKey) return;
    const result = await cianSubscribeWebhooks(deps.apiBase, accessKey, webhookUrlFor(account));
    // eslint-disable-next-line no-console
    if (result.isErr()) console.error('cian register-notifications failed', result.error);
  };

  const deregister = async (account: ChannelAccount): Promise<void> => {
    const accessKey = await deps.resolveAccessKey(account);
    if (!accessKey) return;
    const result = await cianUnsubscribeWebhooks(deps.apiBase, accessKey, webhookUrlFor(account));
    // eslint-disable-next-line no-console
    if (result.isErr()) console.error('cian delete-notifications failed', result.error);
  };

  return {
    platform: 'cian',
  capabilities: {
    listingPublish: 'feed',
    priceSync: 'base-only',
    availabilitySync: 'none',
    bookingIngest: 'none',
    messaging: 'push',
    publishFeedback: 'poll',
  },
  publisher: {
    buildFeed: buildCianFeed,
  },
  publishFeedback: {
    mode: 'poll',
    intervalSec: deps.feedbackPollSec,
    poll: (account) =>
      ResultAsync.fromSafePromise(deps.resolveAccessKey(account)).andThen((accessKey) =>
        accessKey
          ? cianGetOrder(deps.apiBase, accessKey).map((offers) =>
              offers
                .map(toConfirmation)
                .filter((confirmation): confirmation is PublishConfirmation => confirmation !== null),
            )
          : errAsync<PublishConfirmation[], ChannelError>({
              kind: 'auth',
              message: 'Нет Cian ACCESS KEY у аккаунта',
            }),
      ),
  },
  messaging: {
    ingest: {
      mode: 'push',
      // subscribe = регистрация webhook-URL у Циана (v3 register-notifications). Sink не
      // используется: входящие приходят через публичный роут handleWebhook, не через sink.
      subscribe: async (account) => {
        await register(account);
        return async () => deregister(account);
      },
      unsubscribe: (account) => deregister(account),
    },
    send: (account, threadId, text) =>
      ResultAsync.fromSafePromise(deps.resolveAccessKey(account)).andThen((accessKey) =>
        accessKey
          ? cianSendMessage(deps.apiBase, accessKey, threadId, text)
          : errAsync<void, ChannelError>({ kind: 'auth', message: 'Нет Cian ACCESS KEY у аккаунта' }),
      ),
  },
  webhook: {
    // У Циана нет подписи вебхука: защита — секретный URL + контроль доставки (72ч).
    verify: () => okAsync(undefined),
    parse: parseCianWebhook,
  },
  };
};
