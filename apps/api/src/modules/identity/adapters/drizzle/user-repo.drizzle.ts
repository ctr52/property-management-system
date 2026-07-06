import { eq } from 'drizzle-orm';
import type { Role } from '@pms/shared';
import { users } from '../../../../db/schema';
import type { Db } from '../../../../db/client';
import type { User } from '../../domain/types';
import type { UserRepo } from '../../ports/repos';

type Row = typeof users.$inferSelect;

const toDomain = (row: Row): User => ({
  id: row.id,
  orgId: row.orgId,
  email: row.email,
  passwordHash: row.passwordHash,
  role: row.role as Role,
  createdAt: row.createdAt.toISOString(),
});

export const createDrizzleUserRepo = (db: Db): UserRepo => ({
  getByEmail: async (email) => {
    const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  getById: async (id) => {
    const rows = await db.select().from(users).where(eq(users.id, id));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  listByOrg: async (orgId) => {
    const rows = await db.select().from(users).where(eq(users.orgId, orgId));
    return rows.map(toDomain);
  },
  save: async (user) => {
    await db
      .insert(users)
      .values({
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        createdAt: new Date(user.createdAt),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { passwordHash: user.passwordHash, role: user.role },
      });
  },
});
