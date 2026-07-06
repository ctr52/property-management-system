import { err, ok, type Result } from 'neverthrow';
import type { ChannelAccountView, ConnectChannelInput } from '@pms/shared';
import { type AppError, notFoundError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import type { ChannelAccount } from '../domain/types';
import type { ChannelAccountRepo, SecretVault } from '../ports/repos';

export type ManageChannelsDeps = {
  readonly accounts: ChannelAccountRepo;
  readonly vault: SecretVault;
  readonly idGen: IdGen;
  readonly clock: Clock;
  readonly publicBaseUrl: string;
  /** Побочки жизненного цикла аккаунта (запуск ingestion/reconciler, регистрация вебхуков). */
  readonly onConnected?: (account: ChannelAccount) => void | Promise<void>;
  readonly onDisconnected?: (account: ChannelAccount) => void | Promise<void>;
};

const toView = (account: ChannelAccount, publicBaseUrl: string): ChannelAccountView => ({
  id: account.id,
  orgId: account.orgId,
  platform: account.platform,
  status: account.status,
  feedUrl: `${publicBaseUrl}/api/feeds/${account.id}/feed.xml`,
  hasCredentials: account.credentialsRef !== null,
  createdAt: account.createdAt,
});

/**
 * Подключить площадку (upsert: один аккаунт на площадку). Повторное подключение той же площадки
 * обновляет креды и активирует тот же аккаунт — id/feed/webhook-URL остаются стабильными.
 * Креды в vault: Avito — OAuth2-пара, Cian — Bearer access key.
 */
export const connectChannel =
  (deps: ManageChannelsDeps) =>
  async (orgId: string, input: ConnectChannelInput): Promise<Result<ChannelAccountView, AppError>> => {
    const existing = (await deps.accounts.listByOrg(orgId)).find((a) => a.platform === input.platform);

    const credentialsRef =
      input.platform === 'avito'
        ? await deps.vault.put({ clientId: input.apiClientId, clientSecret: input.apiClientSecret })
        : await deps.vault.put({ accessKey: input.accessKey });

    const account: ChannelAccount = existing
      ? { ...existing, status: 'active', credentialsRef }
      : {
          id: deps.idGen(),
          orgId,
          platform: input.platform,
          status: 'active',
          credentialsRef,
          createdAt: deps.clock.now().toISOString(),
        };
    await deps.accounts.save(account);
    await deps.onConnected?.(account); // запустить ingestion/reconciler + зарегистрировать вебхуки

    return ok(toView(account, deps.publicBaseUrl));
  };

export const listChannels =
  (deps: ManageChannelsDeps) =>
  async (orgId: string): Promise<ChannelAccountView[]> => {
    const accounts = await deps.accounts.listByOrg(orgId);
    return accounts.map((account) => toView(account, deps.publicBaseUrl));
  };

/** Отключить (мягко): пауза, id/feed-URL сохраняются. Снимаем регистрацию вебхуков. */
export const disconnectChannel =
  (deps: ManageChannelsDeps) =>
  async (orgId: string, id: string): Promise<Result<ChannelAccountView, AppError>> => {
    const account = await deps.accounts.getById(id);
    if (!account || account.orgId !== orgId) {
      return err(notFoundError('Аккаунт площадки не найден'));
    }
    const disabled: ChannelAccount = { ...account, status: 'disabled' };
    await deps.accounts.save(disabled);
    await deps.onDisconnected?.(disabled);
    return ok(toView(disabled, deps.publicBaseUrl));
  };

/** Включить отключённую площадку обратно (теми же кредами) — заново регистрируем вебхуки. */
export const reconnectChannel =
  (deps: ManageChannelsDeps) =>
  async (orgId: string, id: string): Promise<Result<ChannelAccountView, AppError>> => {
    const account = await deps.accounts.getById(id);
    if (!account || account.orgId !== orgId) {
      return err(notFoundError('Аккаунт площадки не найден'));
    }
    const active: ChannelAccount = { ...account, status: 'active' };
    await deps.accounts.save(active);
    await deps.onConnected?.(active);
    return ok(toView(active, deps.publicBaseUrl));
  };

/** Удалить площадку насовсем. Если была активна — сначала снимаем вебхуки. */
export const deleteChannel =
  (deps: ManageChannelsDeps) =>
  async (orgId: string, id: string): Promise<Result<{ removed: true }, AppError>> => {
    const account = await deps.accounts.getById(id);
    if (!account || account.orgId !== orgId) {
      return err(notFoundError('Аккаунт площадки не найден'));
    }
    if (account.status === 'active') await deps.onDisconnected?.(account);
    await deps.accounts.remove(id);
    return ok({ removed: true });
  };
