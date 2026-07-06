import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../../db/client';
import { listingLinks } from '../../../../db/schema';
import type { ListingLink, ListingMode, Platform, SyncPhase } from '../../domain/types';
import type { ListingLinkRepo } from '../../ports/repos';

type Row = typeof listingLinks.$inferSelect;

const toDomain = (row: Row): ListingLink => ({
  id: row.id,
  orgId: row.orgId,
  propertyId: row.propertyId,
  platform: row.platform as Platform,
  mode: row.mode as ListingMode,
  externalId: row.externalId,
  platformListingId: row.platformListingId,
  phase: row.phase as SyncPhase,
  desiredRevision: row.desiredRevision,
  pushedRevision: row.pushedRevision,
  appliedRevision: row.appliedRevision,
  lastPushedAt: row.lastPushedAt ? row.lastPushedAt.toISOString() : null,
  lastConfirmedAt: row.lastConfirmedAt ? row.lastConfirmedAt.toISOString() : null,
  lastError: row.lastError,
});

export const createDrizzleListingLinkRepo = (db: Db): ListingLinkRepo => ({
  listByProperty: async (orgId, propertyId) => {
    const rows = await db
      .select()
      .from(listingLinks)
      .where(and(eq(listingLinks.orgId, orgId), eq(listingLinks.propertyId, propertyId)));
    return rows.map(toDomain);
  },
  listManagedByOrgPlatform: async (orgId, platform) => {
    const rows = await db
      .select()
      .from(listingLinks)
      .where(
        and(
          eq(listingLinks.orgId, orgId),
          eq(listingLinks.platform, platform),
          eq(listingLinks.mode, 'managed'),
        ),
      );
    return rows.map(toDomain);
  },
  getByPropertyPlatform: async (orgId, propertyId, platform) => {
    const rows = await db
      .select()
      .from(listingLinks)
      .where(
        and(
          eq(listingLinks.orgId, orgId),
          eq(listingLinks.propertyId, propertyId),
          eq(listingLinks.platform, platform),
        ),
      );
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  getByExternalId: async (orgId, platform, externalId) => {
    const rows = await db
      .select()
      .from(listingLinks)
      .where(
        and(
          eq(listingLinks.orgId, orgId),
          eq(listingLinks.platform, platform),
          eq(listingLinks.externalId, externalId),
        ),
      );
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  getByPlatformListingId: async (orgId, platform, platformListingId) => {
    const rows = await db
      .select()
      .from(listingLinks)
      .where(
        and(
          eq(listingLinks.orgId, orgId),
          eq(listingLinks.platform, platform),
          eq(listingLinks.platformListingId, platformListingId),
        ),
      );
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  save: async (link) => {
    const values = {
      id: link.id,
      orgId: link.orgId,
      propertyId: link.propertyId,
      platform: link.platform,
      mode: link.mode,
      externalId: link.externalId,
      platformListingId: link.platformListingId,
      phase: link.phase,
      desiredRevision: link.desiredRevision,
      pushedRevision: link.pushedRevision,
      appliedRevision: link.appliedRevision,
      lastPushedAt: link.lastPushedAt ? new Date(link.lastPushedAt) : null,
      lastConfirmedAt: link.lastConfirmedAt ? new Date(link.lastConfirmedAt) : null,
      lastError: link.lastError,
    };
    await db
      .insert(listingLinks)
      .values(values)
      .onConflictDoUpdate({
        target: listingLinks.id,
        set: {
          platformListingId: values.platformListingId,
          phase: values.phase,
          desiredRevision: values.desiredRevision,
          pushedRevision: values.pushedRevision,
          appliedRevision: values.appliedRevision,
          lastPushedAt: values.lastPushedAt,
          lastConfirmedAt: values.lastConfirmedAt,
          lastError: values.lastError,
        },
      });
  },
  remove: async (orgId, id) => {
    await db.delete(listingLinks).where(and(eq(listingLinks.orgId, orgId), eq(listingLinks.id, id)));
  },
});
