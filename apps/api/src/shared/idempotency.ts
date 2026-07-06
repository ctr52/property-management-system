import { createHash } from 'node:crypto';

/**
 * Детерминированный ключ идемпотентности для платёжных шлюзов. У ЮKassa лимит Idempotence-Key —
 * 64 символа, а составные ключи (orgId-UUID + ISO-дата) его превышают. Хэшируем части в короткую
 * стабильную строку: один и тот же вход → один ключ (ретрай не двоит списание), изменившийся вход
 * (сдвинулся конец периода) → другой ключ (новое списание разрешено).
 */
export const gatewayIdempotencyKey = (...parts: readonly string[]): string =>
  createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 48);
