import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../../app-env';
import type { Subscription } from '../domain/subscription';
import { isReadOnly } from '../domain/subscription';

/** Безопасные (не изменяющие состояние) методы — пропускаем без проверки подписки. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Достаёт подписку организации (порт SubscriptionRepo.getByOrg, обёрнутый в composition root). */
export type ReadSubscription = (orgId: string) => Promise<Subscription | null>;

/**
 * Гейт read-only биллинга тенанта. Запускается ПОСЛЕ requireAuth (auth уже в контексте),
 * композируется через `every(requireAuth, readOnlyGate)` в app.ts.
 *
 * Блокирует только write-методы (POST/PUT/PATCH/DELETE) при `isReadOnly` подписке
 * (expired/canceled — см. [[subscription]]). Чтения (GET) проходят насквозь без обращения к БД.
 *
 * Критично: `/billing` НЕ оборачивается этим гейтом — иначе из read-only нельзя было бы оплатить
 * и выйти. Escape hatch остаётся на чистом requireAuth.
 *
 * Подписки нет (`null`) → пропускаем (fail-open): org ещё не вошла в биллинг-флоу (миграция/
 * онбординг), её нельзя случайно залочить. Лок наступает только при явном статусе expired/canceled.
 */
export const createReadOnlyGate = (read: ReadSubscription): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      await next();
      return;
    }
    const sub = await read(c.get('auth').orgId);
    if (sub && isReadOnly(sub)) {
      return c.json(
        {
          error: {
            kind: 'subscription_read_only' as const,
            message: 'Подписка в режиме «только чтение». Оплатите, чтобы возобновить изменения.',
          },
        },
        403,
      );
    }
    await next();
  };
};
