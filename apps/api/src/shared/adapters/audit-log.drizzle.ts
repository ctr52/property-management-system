import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client';
import { auditLog } from '../../db/schema';
import type { Clock } from '../ports';

/** Запись сквозного audit log. Денежные/чувствительные действия обязаны быть прослеживаемы. */
export type AuditEntry = {
  readonly orgId: string;
  readonly actor: string;
  readonly action: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly meta?: Record<string, unknown>;
};

export type AuditLog = {
  readonly record: (entry: AuditEntry) => Promise<void>;
};

/** Персистентный audit log в БД (заменяет console.log-заглушку). */
export const createDrizzleAuditLog = (db: Db, clock: Clock): AuditLog => ({
  record: async (entry) => {
    await db.insert(auditLog).values({
      id: randomUUID(),
      orgId: entry.orgId,
      actor: entry.actor,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: entry.meta ?? null,
      createdAt: clock.now(),
    });
  },
});
