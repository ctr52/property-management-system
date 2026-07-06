import type { Clock, IdGen } from '../../../shared/ports';
import type { NotificationChannel, NotificationRepo } from '../ports';

/** In-app канал: складывает уведомление в стор (дедуп по idempotencyKey). */
export const createInAppChannel = (deps: {
  repo: NotificationRepo;
  idGen: IdGen;
  clock: Clock;
}): NotificationChannel => ({
  id: 'in_app',
  deliver: async (n) => {
    await deps.repo.saveIfNew({
      id: deps.idGen(),
      orgId: n.orgId,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: false,
      idempotencyKey: n.key,
      createdAt: deps.clock.now().toISOString(),
    });
  },
});
