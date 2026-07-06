import { err, ok, type Result } from 'neverthrow';
import type {
  ConnectProviderInput,
  PaymentAccountView,
  ProviderManifest,
} from '@pms/shared';
import { type AppError, conflictError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { isPublicHttpsUrl } from '../adapters/generic/ssrf';
import type { PaymentAccount } from '../ports/provider';
import type { PaymentAccountRepo, PaymentProviderRegistry, SecretVault } from '../ports/repos';

export type ManageProvidersDeps = {
  readonly registry: PaymentProviderRegistry;
  readonly accounts: PaymentAccountRepo;
  readonly vault: SecretVault;
  readonly idGen: IdGen;
  readonly clock: Clock;
  /** Публичная база API — для построения webhook-URL (ResultURL) push-провайдеров. */
  readonly publicBaseUrl: string;
};

/** URL вебхука для push-провайдеров (его арендодатель вставляет в кабинет своей ПС). */
const webhookUrlFor = (deps: ManageProvidersDeps, account: PaymentAccount): string | null => {
  const adapter = deps.registry.get(account.provider);
  return adapter?.capabilities.ingest === 'push'
    ? `${deps.publicBaseUrl}/api/payment-webhooks/${account.provider}/${account.id}`
    : null;
};

const toView = (deps: ManageProvidersDeps, account: PaymentAccount): PaymentAccountView => ({
  id: account.id,
  orgId: account.orgId,
  provider: account.provider,
  title: account.config.displayName ?? account.provider,
  status: account.status,
  hasCredentials: account.credentialsRef !== null,
  config: account.config,
  webhookUrl: webhookUrlFor(deps, account),
  createdAt: account.createdAt,
});

/** Манифесты доступных провайдеров → фронт рендерит список рельсов и data-driven форму подключения. */
export const listProviders =
  (deps: ManageProvidersDeps) =>
  async (): Promise<ProviderManifest[]> =>
    deps.registry.list().map((adapter) => adapter.manifest);

/**
 * Валидация присланных кред против connectSchema манифеста (рантайм вместо захардкоженного union).
 * Делит поля на секретные (→ vault) и несекретные (→ config). SSRF-гард на url-поля.
 */
const splitCredentials = (
  manifest: ProviderManifest,
  credentials: Readonly<Record<string, string>>,
): Result<{ readonly secret: Record<string, string>; readonly config: Record<string, string> }, AppError> => {
  const secret: Record<string, string> = {};
  const config: Record<string, string> = {};
  for (const field of manifest.connectSchema) {
    const value = credentials[field.key]?.trim() ?? '';
    if (!value) {
      if (field.required) return err(validationError(`Поле «${field.label}» обязательно`));
      continue;
    }
    if (field.kind === 'url' && !isPublicHttpsUrl(value)) {
      return err(validationError(`Поле «${field.label}» должно быть публичным https-URL`));
    }
    if (field.kind === 'select' && field.options && !field.options.includes(value)) {
      return err(validationError(`Недопустимое значение поля «${field.label}»`));
    }
    (field.secret ? secret : config)[field.key] = value;
  }
  return ok({ secret, config });
};

export const connectProvider =
  (deps: ManageProvidersDeps) =>
  async (orgId: string, input: ConnectProviderInput): Promise<Result<PaymentAccountView, AppError>> => {
    const adapter = deps.registry.get(input.provider);
    if (!adapter) return err(validationError(`Неизвестный провайдер: ${input.provider}`));

    const existing = await deps.accounts.listByOrg(orgId);
    if (existing.some((a) => a.provider === input.provider && a.status === 'active')) {
      return err(conflictError(`Провайдер ${input.provider} уже подключён`));
    }

    const split = splitCredentials(adapter.manifest, input.credentials);
    if (split.isErr()) return err(split.error);

    const credentialsRef =
      Object.keys(split.value.secret).length > 0 ? await deps.vault.put(split.value.secret) : null;

    const account: PaymentAccount = {
      id: deps.idGen(),
      orgId,
      provider: input.provider,
      status: 'active',
      credentialsRef,
      config: split.value.config,
      createdAt: deps.clock.now().toISOString(),
    };
    await deps.accounts.save(account);
    return ok(toView(deps, account));
  };

export const listProviderAccounts =
  (deps: ManageProvidersDeps) =>
  async (orgId: string): Promise<PaymentAccountView[]> =>
    (await deps.accounts.listByOrg(orgId)).map((a) => toView(deps, a));

export const disconnectProvider =
  (deps: ManageProvidersDeps) =>
  async (orgId: string, id: string): Promise<Result<PaymentAccountView, AppError>> => {
    const account = await deps.accounts.getById(id);
    if (!account || account.orgId !== orgId) return err(notFoundError('Платёжный аккаунт не найден'));
    const disabled: PaymentAccount = { ...account, status: 'disabled' };
    await deps.accounts.save(disabled);
    return ok(toView(deps, disabled));
  };
