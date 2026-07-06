import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { secrets } from '../../db/schema';

/**
 * Структурная форма SecretVault (совпадает у channel и payments — ADR-0001 «кандидат в shared»).
 * Один drizzle-адаптер обслуживает оба порта; prefix разводит неймспейсы ref'ов.
 */
export type SecretVaultLike = {
  readonly put: (secret: Readonly<Record<string, string>>) => Promise<string>;
  readonly get: (ref: string) => Promise<Record<string, string> | null>;
};

/**
 * Персистентный vault в БД. На greenfield хранит секреты как jsonb; на проде заменяется на
 * внешний secret manager (KMS/Vault) за тем же портом — подключённые каналы/ПС переживают рестарт.
 */
export const createDrizzleSecretVault = (db: Db, prefix: string): SecretVaultLike => ({
  put: async (secret) => {
    const ref = `${prefix}:${randomUUID()}`;
    await db.insert(secrets).values({ ref, data: { ...secret }, createdAt: new Date() });
    return ref;
  },
  get: async (ref) => {
    const rows = await db.select().from(secrets).where(eq(secrets.ref, ref));
    const row = rows[0];
    return row ? (row.data as Record<string, string>) : null;
  },
});
