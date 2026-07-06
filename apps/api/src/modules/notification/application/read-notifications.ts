import type { NotificationFeed, NotificationView } from '@pms/shared';
import type { StoredNotification } from '../domain/types';
import type { NotificationRepo } from '../ports';

const toView = (n: StoredNotification): NotificationView => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  read: n.read,
  createdAt: n.createdAt,
});

export type ReadNotificationsDeps = { readonly repo: NotificationRepo };

export const getNotificationFeed =
  (deps: ReadNotificationsDeps) =>
  async (orgId: string, userId: string): Promise<NotificationFeed> => {
    const items = await deps.repo.listByUser(orgId, userId);
    return { items: items.map(toView), unread: items.filter((i) => !i.read).length };
  };

export const markNotificationRead =
  (deps: ReadNotificationsDeps) =>
  (orgId: string, userId: string, id: string): Promise<void> =>
    deps.repo.markRead(orgId, userId, id);

export const markAllNotificationsRead =
  (deps: ReadNotificationsDeps) =>
  (orgId: string, userId: string): Promise<void> =>
    deps.repo.markAllRead(orgId, userId);
