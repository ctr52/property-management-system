/**
 * Чистое ядро политики пробного периода (cardless trial) с защитой от абьюза.
 *
 * Стратегия (см. обсуждение): высокая конверсия на входе + дорогой обход.
 *  - вход в триал — подтверждённый телефон (предпочтительно звонком);
 *  - один номер = один cardless-триал НАВСЕГДА (eligibility ledger, cross-tenant);
 *  - мягкие сигналы (IP/fingerprint/домен) → скоринг → УСИЛЕНИЕ ТРЕНИЯ, не хард-блок
 *    (один IP — это коворкинг/NAT/семья, блок даст ложные срабатывания).
 *
 * Реальную публикацию на площадки в триале гейтит отдельный механизм привязки аккаунтов
 * (см. [[account-binding]]): даже выданный триал не освобождает от правила «один реальный
 * аккаунт площадки = одна org». Здесь только решение «дать триал / потребовать карту / отказать».
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export type TrialSignals = {
  /** Телефон подтверждён (звонок/смс). Без этого вход в триал закрыт. */
  readonly phoneVerified: boolean;
  /** Этот номер уже использовал триал когда-либо (из eligibility ledger). */
  readonly phoneUsedTrialBefore: boolean;
  /** Скоринг мягких сигналов. Влияет на трение, не на отказ. */
  readonly risk: RiskLevel;
};

export type TrialPolicy =
  | { readonly kind: 'grant_trial' }
  | { readonly kind: 'require_card_first'; readonly reason: string }
  | { readonly kind: 'reject'; readonly reason: string };

/**
 * Порядок проверок = приоритет правил:
 *  1. нет подтверждённого телефона → reject (телефон — вход в триал);
 *  2. номер уже жёг триал → require_card_first (один номер = один cardless-триал);
 *  3. high risk → require_card_first (усиление трения, не блок);
 *  4. иначе → grant_trial.
 */
export const decideTrialPolicy = (s: TrialSignals): TrialPolicy => {
  if (!s.phoneVerified) {
    return { kind: 'reject', reason: 'Подтвердите номер телефона, чтобы активировать пробный период' };
  }
  if (s.phoneUsedTrialBefore) {
    return { kind: 'require_card_first', reason: 'Этот номер уже использовал пробный период' };
  }
  if (s.risk === 'high') {
    return { kind: 'require_card_first', reason: 'Для активации потребуется привязка карты' };
  }
  return { kind: 'grant_trial' };
};
