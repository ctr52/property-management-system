import type { NotificationChannelRegistry } from '../ports';

export type DispatchInput = {
  readonly orgId: string;
  readonly recipients: readonly string[];
  readonly type: string;
  readonly title: string;
  readonly body: string;
  /** Базовый ключ идемпотентности события (доводится до канала с userId+channelId). */
  readonly key: string;
  readonly via: readonly string[];
};

export type DispatchDeps = {
  readonly channels: NotificationChannelRegistry;
};

/** Разослать уведомление получателям по выбранным каналам. Каждый канал дедупит сам. */
export const dispatchNotification =
  (deps: DispatchDeps) =>
  async (input: DispatchInput): Promise<void> => {
    for (const userId of input.recipients) {
      for (const channelId of input.via) {
        const channel = deps.channels.get(channelId);
        if (!channel) continue;
        await channel.deliver({
          orgId: input.orgId,
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          key: `${input.key}:${userId}:${channelId}`,
        });
      }
    }
  };
