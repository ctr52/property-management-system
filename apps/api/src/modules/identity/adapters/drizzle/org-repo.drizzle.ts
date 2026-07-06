import { organizations } from '../../../../db/schema';
import type { Db } from '../../../../db/client';
import type { OrgRepo } from '../../ports/repos';

export const createDrizzleOrgRepo = (db: Db): OrgRepo => ({
  save: async (org) => {
    await db
      .insert(organizations)
      .values({ id: org.id, name: org.name, createdAt: new Date(org.createdAt) })
      .onConflictDoUpdate({ target: organizations.id, set: { name: org.name } });
  },
});
