import type { NotificationChannel, NotificationChannelRegistry } from '../ports';

export const createNotificationChannelRegistry = (
  channels: readonly NotificationChannel[],
): NotificationChannelRegistry => {
  const byId = new Map(channels.map((c) => [c.id, c]));
  return { get: (id) => byId.get(id) };
};
