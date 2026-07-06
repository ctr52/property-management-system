import type { RealtimeHub } from '../../../shared/realtime-hub';
import type { MessageStore } from '../ports/repos';

/**
 * Декоратор MessageStore: после реального append отражает сохранённое сообщение (вместе с нашим
 * threadId) в realtime-хаб (SSE инбокса). Эмиссия на границе записи в unified inbox — кто бы ни
 * писал (входящее через ingest или исходящий reply). Use-cases про realtime не знают.
 */
export const withMessageEvents = (inner: MessageStore, hub: RealtimeHub): MessageStore => ({
  append: async (orgId, message) => {
    const stored = await inner.append(orgId, message);
    hub.publish(orgId, { event: 'message', data: stored });
    return stored;
  },
  listByOrg: inner.listByOrg,
});
