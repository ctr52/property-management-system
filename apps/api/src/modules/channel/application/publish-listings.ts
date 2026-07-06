import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFoundError } from '../../../shared/errors';
import type { Clock } from '../../../shared/ports';
import { markPushed } from '../domain/sync-status';
import type { ChannelError } from '../domain/types';
import type {
  AdapterRegistry,
  ChannelAccountRepo,
  FeedHost,
  ListingLinkRepo,
  ListingSource,
} from '../ports/repos';

export type PublishListingsDeps = {
  readonly accounts: ChannelAccountRepo;
  readonly listings: ListingSource;
  readonly links: ListingLinkRepo;
  readonly feedHost: FeedHost;
  readonly registry: AdapterRegistry;
  readonly clock: Clock;
  readonly publicBaseUrl: string;
};

export type PublishResult = { readonly feedUrl: string; readonly count: number };

/**
 * Use-case: собрать фид по объектам организации и выложить на хостинг.
 * Площадка (Cian/Avito) дальше сама заберёт фид pull'ом.
 */
export const publishListings =
  (deps: PublishListingsDeps) =>
  async (accountId: string): Promise<Result<PublishResult, AppError | ChannelError>> => {
    const account = await deps.accounts.getById(accountId);
    if (!account) {
      return err(notFoundError('Аккаунт площадки не найден'));
    }

    const adapter = deps.registry.get(account.platform);
    if (!adapter?.publisher) {
      return err({ kind: 'not_implemented', message: `Публикация для ${account.platform} не поддерживается` });
    }

    const listings = await deps.listings.listManagedForPlatform(account.orgId, account.platform);
    const feed = adapter.publisher.buildFeed(listings);
    if (feed.isErr()) {
      return err(feed.error);
    }

    await deps.feedHost.put(account.id, feed.value);

    // Фид выложен → отмечаем managed-связи отправленными (фиксируем pushedRevision).
    // Подтверждение «applied» придёт позже от reconciler'а (площадка заберёт фид pull'ом).
    const now = deps.clock.now().toISOString();
    const links = await deps.links.listManagedByOrgPlatform(account.orgId, account.platform);
    for (const link of links) {
      await deps.links.save(markPushed(link, now));
    }

    return ok({
      feedUrl: `${deps.publicBaseUrl}/api/feeds/${account.id}/feed.xml`,
      count: listings.length,
    });
  };
