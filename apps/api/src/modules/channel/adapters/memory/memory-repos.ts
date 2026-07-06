import { randomUUID } from 'node:crypto';
import type {
  ChannelAccount,
  ChannelEvent,
  ChannelMessage,
  FeedDocument,
  ListingLink,
  Platform,
} from '../../domain/types';
import type {
  ChannelAccountRepo,
  FeedHost,
  InboxRepo,
  ListingLinkRepo,
  MessageStore,
  SecretVault,
  StoredMessage,
} from '../../ports/repos';

/** In-memory unified inbox: последние сообщения по организациям + маппинг диалогов. */
export const createInMemoryMessageStore = (): MessageStore => {
  const items: StoredMessage[] = [];
  const threadIds = new Map<string, string>();
  const ensureThreadId = (orgId: string, platform: Platform, externalThreadId: string): string => {
    const key = `${orgId}:${platform}:${externalThreadId}`;
    let id = threadIds.get(key);
    if (!id) {
      id = randomUUID();
      threadIds.set(key, id);
    }
    return id;
  };
  return {
    append: async (orgId: string, message: ChannelMessage) => {
      const threadId = ensureThreadId(orgId, message.platform, message.externalThreadId);
      const stored: StoredMessage = { ...message, orgId, threadId, receivedAt: new Date().toISOString() };
      items.unshift(stored);
      if (items.length > 500) items.pop();
      return stored;
    },
    listByOrg: async (orgId: string) => items.filter((m) => m.orgId === orgId).slice(0, 200),
  };
};

export const createInMemoryChannelAccountRepo = (
  seed: readonly ChannelAccount[] = [],
): ChannelAccountRepo => {
  const store = new Map<string, ChannelAccount>(seed.map((a) => [a.id, a]));
  return {
    getById: async (id) => store.get(id) ?? null,
    listByOrg: async (orgId) => [...store.values()].filter((a) => a.orgId === orgId),
    listAll: async () => [...store.values()],
    save: async (account) => {
      store.set(account.id, account);
    },
    remove: async (id) => {
      store.delete(id);
    },
  };
};

/** Заглушка vault: секреты в памяти. Заменить на реальный secret manager. */
export const createInMemorySecretVault = (): SecretVault => {
  const store = new Map<string, Record<string, string>>();
  return {
    put: async (secret) => {
      const ref = `mem:${randomUUID()}`;
      store.set(ref, { ...secret });
      return ref;
    },
    get: async (ref) => store.get(ref) ?? null,
  };
};

export const createInMemoryListingLinkRepo = (seed: readonly ListingLink[] = []): ListingLinkRepo => {
  const store = new Map<string, ListingLink>(seed.map((l) => [l.id, l]));
  const forOrg = (orgId: string) => [...store.values()].filter((l) => l.orgId === orgId);
  return {
    listByProperty: async (orgId, propertyId) =>
      forOrg(orgId).filter((l) => l.propertyId === propertyId),
    listManagedByOrgPlatform: async (orgId, platform: Platform) =>
      forOrg(orgId).filter((l) => l.platform === platform && l.mode === 'managed'),
    getByPropertyPlatform: async (orgId, propertyId, platform: Platform) =>
      forOrg(orgId).find((l) => l.propertyId === propertyId && l.platform === platform) ?? null,
    getByExternalId: async (orgId, platform: Platform, externalId) =>
      forOrg(orgId).find((l) => l.platform === platform && l.externalId === externalId) ?? null,
    getByPlatformListingId: async (orgId, platform: Platform, platformListingId) =>
      forOrg(orgId).find((l) => l.platform === platform && l.platformListingId === platformListingId) ?? null,
    save: async (link) => {
      store.set(link.id, link);
    },
    remove: async (orgId, id) => {
      const link = store.get(id);
      if (link && link.orgId === orgId) store.delete(id);
    },
  };
};

export const createInMemoryFeedHost = (): FeedHost => {
  const store = new Map<string, FeedDocument>();
  return {
    put: async (accountId, doc) => {
      store.set(accountId, doc);
    },
    get: async (accountId) => store.get(accountId) ?? null,
  };
};

export const createInMemoryInboxRepo = (): InboxRepo => {
  const seen = new Set<string>();
  return {
    append: async (idempotencyKey: string, _event: ChannelEvent) => {
      if (seen.has(idempotencyKey)) {
        return { deduped: true };
      }
      seen.add(idempotencyKey);
      return { deduped: false };
    },
  };
};
