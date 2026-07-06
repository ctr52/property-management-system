import { markOutdated } from '../domain/sync-status';
import type { ListingLinkRepo } from '../ports/repos';

export type MarkListingsOutdatedDeps = {
  readonly listings: ListingLinkRepo;
};

/**
 * Контент объекта изменился → managed-листинги надо переотправить.
 * Поднимаем desiredRevision и возвращаем фазу в queued; outbox-воркер дальше перевыложит фид/API.
 * attached-связи пропускаем — там только маппинг, контент мы не публикуем.
 */
export const markListingsOutdated =
  (deps: MarkListingsOutdatedDeps) =>
  async (orgId: string, propertyId: string): Promise<void> => {
    const links = await deps.listings.listByProperty(orgId, propertyId);
    for (const link of links) {
      if (link.mode !== 'managed') continue;
      await deps.listings.save(markOutdated(link));
    }
  };
