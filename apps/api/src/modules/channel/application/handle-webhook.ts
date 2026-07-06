import type { Platform } from '../domain/types';
import type { RawWebhookRequest } from '../ports/adapter';
import type { AdapterRegistry, ChannelAccountRepo } from '../ports/repos';
import type { IngestChannelEvent } from './ingest-event';

export type HandleWebhookDeps = {
  readonly registry: AdapterRegistry;
  readonly accounts: ChannelAccountRepo;
  /** Единая проекция события в домен — общая с поллингом (Ingestion Runner). */
  readonly ingest: IngestChannelEvent;
};

/**
 * Приём push-вебхука площадки (по неугадываемому accountId в URL): verify → parse → нормализованные
 * события → единая проекция `ingest`. Привязка к организации — через аккаунт. Всё мягко:
 * чужое/битое тихо игнорируем. Запись в сторы — НЕ здесь, а в общем `ingestChannelEvent`
 * (та же, что у поллинга), поэтому push и poll сходятся в одну точку.
 */
export const handleWebhook =
  (deps: HandleWebhookDeps) =>
  async (platform: Platform, accountId: string, req: RawWebhookRequest): Promise<void> => {
    const account = await deps.accounts.getById(accountId);
    if (!account || account.platform !== platform || account.status !== 'active') return;

    const adapter = deps.registry.get(platform);
    if (!adapter?.webhook) return;
    if ((await adapter.webhook.verify(account, req)).isErr()) return;

    const parsed = adapter.webhook.parse(req);
    if (parsed.isErr()) return;

    for (const event of parsed.value) {
      await deps.ingest(account, event);
    }
  };
