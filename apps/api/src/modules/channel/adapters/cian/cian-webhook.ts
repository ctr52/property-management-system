import { ok, type Result } from 'neverthrow';
import type { ChannelError, ChannelEvent } from '../../domain/types';
import type { RawWebhookRequest } from '../../ports/adapter';

/**
 * Вебхук Cian v3 (offersMessagesIncoming): chats[].messages[] с content.text.
 * Разворачиваем в нормализованные ChannelMessage. Битый payload → [].
 */
export const parseCianWebhook = (req: RawWebhookRequest): Result<readonly ChannelEvent[], ChannelError> => {
  try {
    const body = JSON.parse(req.rawBody) as {
      chats?: Array<{
        chatId?: number | string;
        messages?: Array<{
          messageId?: string;
          direction?: string;
          createdAt?: string;
          content?: { text?: string };
        }>;
      }>;
    };

    const events: ChannelEvent[] = [];
    for (const chat of body.chats ?? []) {
      for (const message of chat.messages ?? []) {
        events.push({
          type: 'message',
          payload: {
            platform: 'cian',
            externalThreadId: String(chat.chatId ?? ''),
            externalMessageId: String(message.messageId ?? ''),
            direction: message.direction === 'out' ? 'out' : 'in',
            text: message.content?.text ?? '',
            sentAt: message.createdAt ?? new Date().toISOString(),
          },
        });
      }
    }
    return ok(events);
  } catch {
    return ok([]);
  }
};
