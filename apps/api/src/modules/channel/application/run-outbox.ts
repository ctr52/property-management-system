import type { ChannelAccountRepo, ListingLinkRepo, Scheduler } from '../ports/repos';

export type OutboxDeps = {
  readonly scheduler: Scheduler;
  readonly accounts: ChannelAccountRepo;
  readonly links: ListingLinkRepo;
  /** Толкач — publishListings: перевыкладывает фид аккаунта и метит managed-связи pushed. */
  readonly publish: (accountId: string) => Promise<unknown>;
  readonly intervalSec: number;
};

/**
 * Outbox-воркер: периодически находит аккаунты с managed-связями в фазе queued и
 * запускает публикацию. Идемпотентно: publishListings перевыкладывает весь фид и метит
 * связи pushed; ошибка оставляет связь в queued — повторим на следующем тике.
 */
export const startOutbox =
  (deps: OutboxDeps) =>
  (): void => {
    deps.scheduler.every(deps.intervalSec, async () => {
      for (const account of await deps.accounts.listAll()) {
        if (account.status !== 'active') continue;
        const links = await deps.links.listManagedByOrgPlatform(account.orgId, account.platform);
        if (links.some((link) => link.phase === 'queued')) {
          await deps.publish(account.id);
        }
      }
    });
  };
