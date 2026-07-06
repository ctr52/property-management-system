import { ok, type Result } from 'neverthrow';
import type { ChannelError, ChannelEvent } from '../../domain/types';
import type { RawWebhookRequest } from '../../ports/adapter';

type AvitoValue = {
  // message
  id?: string | number;
  chat_id?: string | number;
  created?: number;
  direction?: string;
  content?: { text?: string };
  // booking
  item_id?: string | number;
  date_start?: string;
  date_end?: string;
  guest_name?: string;
  amount?: number;
  currency?: string;
  status?: string;
};

/**
 * Вебхук Avito: payload.type = 'message' | 'booking' → нормализованное событие.
 * (Брони у Avito в реальности — poll getRealtyBookings; здесь принимаем и вебхуком для песочницы.)
 * Битый payload → [].
 */
export const parseAvitoWebhook = (req: RawWebhookRequest): Result<readonly ChannelEvent[], ChannelError> => {
  try {
    const body = JSON.parse(req.rawBody) as { payload?: { type?: string; value?: AvitoValue } };
    const value = body.payload?.value;
    const type = body.payload?.type;
    if (!value) return ok([]);

    if (type === 'message') {
      return ok([
        {
          type: 'message',
          payload: {
            platform: 'avito',
            externalThreadId: String(value.chat_id ?? ''),
            externalMessageId: String(value.id ?? ''),
            direction: value.direction === 'out' ? 'out' : 'in',
            text: value.content?.text ?? '',
            sentAt: value.created ? new Date(value.created * 1000).toISOString() : new Date().toISOString(),
          },
        },
      ]);
    }

    if (type === 'booking') {
      return ok([
        {
          type: 'booking',
          payload: {
            platform: 'avito',
            externalBookingId: String(value.id ?? ''),
            externalListingId: String(value.item_id ?? ''),
            checkIn: String(value.date_start ?? ''),
            checkOut: String(value.date_end ?? ''),
            guestName: value.guest_name,
            amountMinor: typeof value.amount === 'number' ? value.amount : 0,
            currency: value.currency ?? 'RUB',
            // Avito-бронь по умолчанию подтверждённая (firm). Для теста tentative — status:'new'.
            status: value.status === 'new' ? 'new' : value.status === 'cancelled' ? 'cancelled' : 'confirmed',
          },
        },
      ]);
    }

    return ok([]);
  } catch {
    return ok([]);
  }
};
