import { err, ok, type Result } from 'neverthrow';
import { type AppError, conflictError, notFoundError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import type { AdapterRegistry, ChannelAccountRepo, MessageStore, ThreadStore } from '../ports/repos';

export type SendMessageDeps = {
  readonly registry: AdapterRegistry;
  readonly accounts: ChannelAccountRepo;
  readonly threads: ThreadStore;
  readonly messages: MessageStore;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

/**
 * Ответ в диалог по НАШЕМУ внутреннему id: резолвим тред площадки (platform + externalThreadId),
 * шлём через адаптер и сразу отражаем исходящее сообщение в инбоксе. Площадочные id наружу не текут.
 */
export const replyToThread =
  (deps: SendMessageDeps) =>
  async (orgId: string, threadId: string, text: string): Promise<Result<void, AppError>> => {
    const thread = await deps.threads.get(orgId, threadId);
    if (!thread) {
      return err(notFoundError('Диалог не найден'));
    }
    const { platform, externalThreadId } = thread;

    const account = (await deps.accounts.listByOrg(orgId)).find(
      (a) => a.platform === platform && a.status === 'active',
    );
    if (!account) {
      return err(notFoundError(`Площадка ${platform} не подключена`));
    }

    const send = deps.registry.get(platform)?.messaging?.send;
    if (!send) {
      return err(conflictError(`Отправка для ${platform} недоступна`));
    }

    const result = await send(account, externalThreadId, text);
    if (result.isErr()) {
      return err(conflictError(result.error.message));
    }

    await deps.messages.append(orgId, {
      platform,
      externalThreadId,
      externalMessageId: `out-${deps.idGen()}`,
      direction: 'out',
      text,
      sentAt: deps.clock.now().toISOString(),
    });
    return ok(undefined);
  };
