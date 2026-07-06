import { describe, expect, it } from 'vitest';
import type { ChannelAccount, ChannelEvent, ChannelMessage, ExternalBooking } from '../domain/types';
import type { InboxRepo, MessageStore } from '../ports/repos';
import { ingestChannelEvent } from './ingest-event';

const account: ChannelAccount = {
  id: 'acc-1',
  orgId: 'org-1',
  platform: 'avito',
  status: 'active',
  credentialsRef: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const message = (externalMessageId: string): ChannelEvent => ({
  type: 'message',
  payload: {
    platform: 'avito',
    externalThreadId: 'thread-1',
    externalMessageId,
    direction: 'in',
    text: 'Привет',
    sentAt: '2026-06-01T10:00:00Z',
  },
});

const booking = (externalBookingId: string): ChannelEvent => ({
  type: 'booking',
  payload: {
    platform: 'avito',
    externalBookingId,
    externalListingId: 'AV-1',
    checkIn: '2026-07-10',
    checkOut: '2026-07-12',
    amountMinor: 500_000,
    currency: 'RUB',
    status: 'new',
  },
});

const fakeInbox = () => {
  const seen = new Set<string>();
  const inbox: InboxRepo = {
    append: async (key) => {
      if (seen.has(key)) return { deduped: true };
      seen.add(key);
      return { deduped: false };
    },
  };
  return inbox;
};

const fakeMessages = () => {
  const stored: { orgId: string; message: ChannelMessage }[] = [];
  const messages: MessageStore = {
    append: async (orgId, message) => {
      stored.push({ orgId, message });
      return { ...message, orgId, threadId: `${message.platform}:${message.externalThreadId}`, receivedAt: '' };
    },
    listByOrg: async (orgId) =>
      stored
        .filter((s) => s.orgId === orgId)
        .map((s) => ({
          ...s.message,
          orgId: s.orgId,
          threadId: `${s.message.platform}:${s.message.externalThreadId}`,
          receivedAt: '',
        })),
  };
  return { messages, stored };
};

describe('ingestChannelEvent (единая проекция входящих)', () => {
  it('сообщение → стор с orgId аккаунта', async () => {
    const inbox = fakeInbox();
    const { messages, stored } = fakeMessages();
    const ingest = ingestChannelEvent({ inbox, messages, ingestBooking: async () => {} });

    await ingest(account, message('m-1'));

    expect(stored).toHaveLength(1);
    expect(stored[0]?.orgId).toBe('org-1');
    expect(stored[0]?.message.externalMessageId).toBe('m-1');
  });

  it('повтор того же сообщения дедуплицируется (inbox) — в стор не попадает дважды', async () => {
    const inbox = fakeInbox();
    const { messages, stored } = fakeMessages();
    const ingest = ingestChannelEvent({ inbox, messages, ingestBooking: async () => {} });

    await ingest(account, message('m-1'));
    await ingest(account, message('m-1'));

    expect(stored).toHaveLength(1);
  });

  it('бронь → ingestBooking с orgId аккаунта (дедуп — внутри самого ingest)', async () => {
    const inbox = fakeInbox();
    const { messages } = fakeMessages();
    const calls: { orgId: string; booking: ExternalBooking }[] = [];
    const ingest = ingestChannelEvent({
      inbox,
      messages,
      ingestBooking: async (orgId, booking) => {
        calls.push({ orgId, booking });
      },
    });

    await ingest(account, booking('b-1'));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.orgId).toBe('org-1');
    expect(calls[0]?.booking.externalBookingId).toBe('b-1');
  });
});
