import type { InboxMessage } from './api';

/**
 * Диалог unified inbox. Идентифицируется НАШИМ внутренним id (`threadId`, uuid с бэкенда) —
 * площадочный `externalThreadId` остаётся лишь для отображения и наружу (в URL) не торчит.
 * Источник правды — плоский список из кэша useInbox; группировка здесь, чистой функцией.
 */
export type InboxThread = {
  /** Хвост маршрута диалога (= внутренний threadId). */
  readonly key: string;
  readonly threadId: string;
  readonly platform: InboxMessage['platform'];
  /** Реальный id треда на площадке — только для подписи в UI. */
  readonly externalThreadId: string;
  /** Сообщения по возрастанию времени (старое → новое). */
  readonly messages: readonly InboxMessage[];
  /** Последнее сообщение — для превью в списке чатов. */
  readonly last: InboxMessage;
};

const bySentAtAsc = (a: InboxMessage, b: InboxMessage) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0);

/** Разбор выбранного диалога из pathname (`/inbox/<threadId>`). */
export const parseThreadSelection = (path: string): { threadId: string } | null => {
  const threadId = path.match(/^\/inbox\/([^/]+)\/?$/)?.[1];
  return threadId ? { threadId } : null;
};

/** Группировка плоского списка в треды (по нашему threadId), отсортированные по свежести. */
export const groupThreads = (messages: readonly InboxMessage[]): InboxThread[] => {
  const byThread = new Map<string, InboxMessage[]>();
  for (const message of messages) {
    const list = byThread.get(message.threadId) ?? [];
    list.push(message);
    byThread.set(message.threadId, list);
  }
  return [...byThread.values()]
    .map((list) => [...list].sort(bySentAtAsc))
    .flatMap((sorted) => {
      const first = sorted[0];
      if (!first) return []; // недостижимо (списки непустые), но сужает тип
      const last = sorted[sorted.length - 1] ?? first;
      return [
        {
          key: first.threadId,
          threadId: first.threadId,
          platform: first.platform,
          externalThreadId: first.externalThreadId,
          messages: sorted,
          last,
        } satisfies InboxThread,
      ];
    })
    .sort((a, b) => (a.last.sentAt > b.last.sentAt ? -1 : a.last.sentAt < b.last.sentAt ? 1 : 0));
};

/** Сообщения одного диалога (по нашему threadId), по возрастанию времени. */
export const selectThreadMessages = (messages: readonly InboxMessage[], threadId: string): InboxMessage[] =>
  messages.filter((m) => m.threadId === threadId).sort(bySentAtAsc);
