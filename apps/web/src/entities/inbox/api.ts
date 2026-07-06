import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { api } from '../../shared/api/client';
import { groupThreads, selectThreadMessages, type InboxThread } from './model';

export const inboxKeys = {
  all: ['inbox'] as const,
};

/** Сообщение в unified inbox — тип берём прямо из ответа API (end-to-end типобезопасность). */
export type InboxMessage = InferResponseType<typeof api.channels.messages.$get>[number];

/** Входящие сообщения со всех площадок (unified inbox). SSE — основной путь; poll — фолбэк. */
export const useInbox = () =>
  useQuery({
    queryKey: inboxKeys.all,
    // Реалтайм идёт через useInboxStream → setQueryData. Редкий poll — страховка, если SSE отвалится.
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await api.channels.messages.$get();
      if (!res.ok) {
        throw new Error('Не удалось загрузить сообщения');
      }
      return res.json();
    },
  });

/**
 * Список диалогов (треды) — деривация поверх того же кэша useInbox. Виджет списка чатов
 * самодостаточен: зовёт этот хук, не зная про деталь чата.
 */
export const useThreads = (): { threads: InboxThread[]; isLoading: boolean; isError: boolean } => {
  const inbox = useInbox();
  const threads = useMemo(() => (inbox.data ? groupThreads(inbox.data) : []), [inbox.data]);
  return { threads, isLoading: inbox.isLoading, isError: inbox.isError };
};

/**
 * Сообщения одного диалога — деривация поверх кэша useInbox (по возрастанию времени).
 * Виджет детали чата самодостаточен: зовёт этот хук, не зная про список.
 */
export const useThread = (
  threadId: string,
): { messages: InboxMessage[]; isLoading: boolean; isError: boolean } => {
  const inbox = useInbox();
  const messages = useMemo(
    () => (inbox.data ? selectThreadMessages(inbox.data, threadId) : []),
    [inbox.data, threadId],
  );
  return { messages, isLoading: inbox.isLoading, isError: inbox.isError };
};

/**
 * Realtime-подписка на инбокс: SSE пишет новые сообщения прямо в кэш TanStack Query.
 * Без глобального стора — источник правды остаётся серверным, виджет лишь обновляет свой кэш.
 * EventSource сам переподключается при обрыве; на размонтировании закрываем поток.
 */
export const useInboxStream = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource('/api/channels/messages/stream', { withCredentials: true });
    source.addEventListener('message', (event) => {
      const incoming = JSON.parse((event as MessageEvent).data) as InboxMessage;
      queryClient.setQueryData<InboxMessage[]>(inboxKeys.all, (prev) => {
        const list = prev ?? [];
        // Идемпотентно: дедуп по (platform, externalMessageId) — SSE может продублировать.
        const exists = list.some(
          (m) => m.platform === incoming.platform && m.externalMessageId === incoming.externalMessageId,
        );
        return exists ? list : [incoming, ...list];
      });
    });
    return () => source.close();
  }, [queryClient]);
};
