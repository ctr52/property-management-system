/**
 * Анти-абьюз привязки реального аккаунта площадки к организации.
 *
 * Идея: завести подтверждённый аккаунт на Avito/Cian и привязать к нему помещение — дорого и
 * долго. Поэтому при подключении площадки мы фиксируем ИДЕНТИЧНОСТЬ внешнего аккаунта
 * (`externalAccountId`, выдаётся адаптером через capability `AccountIdentity.identify`) в
 * ГЛОБАЛЬНОМ (cross-tenant) реестре `(platform, externalAccountId) → orgId`. Это делает
 * бесплатный пере-триал невыгодным: один реальный аккаунт площадки нельзя увести в другую org,
 * а пока триал не оплачен — нельзя и отвязать, чтобы освободить его под новую org.
 *
 * Здесь только чистые правила (без IO). Реестр и whoami — за портами (см. ports/repos.ts,
 * ports/adapter.ts). Связка с состоянием подписки — через [[trial-policy]] (DetachGate).
 */
import type { Platform } from './types';

/** Идентичность реального аккаунта на площадке (whoami) — то, что мы запоминаем. */
export type ExternalAccountIdentity = {
  readonly platform: Platform;
  /** Стабильный id аккаунта НА площадке (Avito user_id, Cian accountId). Это НЕ наш id. */
  readonly externalAccountId: string;
};

/** Запись глобального реестра: кто уже владеет этим внешним аккаунтом. */
export type AccountBindingRecord = {
  readonly platform: Platform;
  readonly externalAccountId: string;
  readonly orgId: string;
};

export type BindingDecision =
  | { readonly kind: 'bind'; readonly identity: ExternalAccountIdentity }
  | { readonly kind: 'conflict'; readonly ownedByOrgId: string };

/**
 * Можно ли привязать внешний аккаунт к запрашивающей org.
 *  - свободен → bind;
 *  - уже за этой же org → bind (идемпотентно: повторное подключение теми же кредами);
 *  - за другой org → conflict (нельзя увести чужой подтверждённый аккаунт).
 */
export const decideAccountBinding = (params: {
  readonly requestingOrgId: string;
  readonly identity: ExternalAccountIdentity;
  readonly existing: AccountBindingRecord | null;
}): BindingDecision => {
  const { requestingOrgId, identity, existing } = params;
  if (existing === null || existing.orgId === requestingOrgId) {
    return { kind: 'bind', identity };
  }
  return { kind: 'conflict', ownedByOrgId: existing.orgId };
};

/**
 * Замок на отвязку аккаунта площадки. Зависит только от факта «триал не оплачен» —
 * сам факт вычисляет домен подписок (DetachGate), здесь канал не знает деталей биллинга.
 */
export type DetachGate = {
  /** Триал ещё не оплачен: привязки заморожены, чтобы аккаунт нельзя было освободить под новый триал. */
  readonly trialUnpaid: boolean;
};

export type DetachDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'locked'; readonly reason: string };

/**
 * Можно ли отвязать/удалить привязанный аккаунт площадки. На неоплаченном триале — нельзя:
 * иначе схема «привязал → отвязал → новый триал» делает обход бесплатным.
 */
export const decideDetach = (gate: DetachGate): DetachDecision =>
  gate.trialUnpaid
    ? {
        kind: 'locked',
        reason: 'Аккаунт площадки привязан и не может быть отвязан до оплаты подписки',
      }
    : { kind: 'allow' };
