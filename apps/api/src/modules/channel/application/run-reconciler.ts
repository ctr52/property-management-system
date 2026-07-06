import type { Clock } from '../../../shared/ports';
import { applyConfirmation } from '../domain/sync-status';
import type { ChannelAccount, PublishConfirmation } from '../domain/types';
import type { ChannelAdapter } from '../ports/adapter';
import type { ListingLinkRepo, Scheduler } from '../ports/repos';

export type ReconcilerDeps = {
  readonly scheduler: Scheduler;
  readonly listings: ListingLinkRepo;
  readonly clock: Clock;
};

/**
 * Свести подтверждения площадки в связи (по externalId). Идемпотентно: applyConfirmation —
 * чистая функция, повторное подтверждение той же ревизии даёт тот же результат.
 * Используется и poll-лупом ниже, и (позже) HTTP-роутом вебхука Avito.
 */
export const reconcileConfirmations =
  (deps: ReconcilerDeps) =>
  async (account: ChannelAccount, confirmations: readonly PublishConfirmation[]): Promise<void> => {
    const now = deps.clock.now().toISOString();
    for (const confirmation of confirmations) {
      const link = await deps.listings.getByExternalId(
        account.orgId,
        account.platform,
        confirmation.externalId,
      );
      if (!link) continue; // чужой/неизвестный листинг — пропускаем
      await deps.listings.save(applyConfirmation(link, confirmation, now));
    }
  };

/**
 * Запускает обратную связь по публикации для аккаунта по возможностям адаптера.
 * poll — крутим луп (Cian get-order); webhook — приходит через HTTP-роут, не отсюда;
 * sync — подтверждение приходит прямо при push'е; none — подтверждать нечем.
 */
export const startReconciler =
  (deps: ReconcilerDeps) =>
  (account: ChannelAccount, adapter: ChannelAdapter): void => {
    const feedback = adapter.publishFeedback;
    if (!feedback || feedback.mode !== 'poll') return;

    const reconcile = reconcileConfirmations(deps);
    deps.scheduler.every(feedback.intervalSec, async () => {
      const result = await feedback.poll(account);
      if (result.isOk()) {
        await reconcile(account, result.value);
      }
    });
  };
