import { err, ok } from 'neverthrow';
import type { HoldTier } from '@pms/shared';
import { conflictError, notFoundError } from '../shared/errors';
import { overlaps } from '../modules/availability/domain/interval';
import type { AvailabilityPort } from '../modules/reservation/ports/availability';
import type { ReservationRepo } from '../modules/reservation/ports/reservation-repo';
import type { Reservation, ReservationSource } from '../modules/reservation/domain/types';

/**
 * Фейк AvailabilityPort: тот же инвариант + тиры firm/tentative, вытеснение, истечение —
 * через доменный overlaps, без БД. Для проверки оркестрации use-case'ов.
 */
export const createFakeAvailability = (knownProperties: readonly string[] = ['p1']) => {
  type H = {
    id: string;
    orgId: string;
    propertyId: string;
    from: string;
    to: string;
    tier: HoldTier;
    expiresAt: string | null;
    refId: string;
  };
  const holds = new Map<string, H>();
  let n = 0;
  const knows = (p: string) => knownProperties.length === 0 || knownProperties.includes(p);
  const isActive = (h: H, now: string) => h.tier === 'firm' || h.expiresAt === null || h.expiresAt > now;

  const port: AvailabilityPort = {
    hold: async ({ orgId, propertyId, from, to, refId, tier, expiresAt }) => {
      if (!knows(propertyId)) return err(notFoundError('Объект не найден'));
      const now = new Date().toISOString();
      const active = [...holds.values()].filter(
        (h) => h.orgId === orgId && h.propertyId === propertyId && overlaps(h.from, h.to, from, to) && isActive(h, now),
      );
      let preemptedRefIds: string[] = [];
      if (tier === 'firm') {
        if (active.some((h) => h.tier === 'firm')) return err(conflictError('Эти даты уже заняты'));
        const tentatives = active.filter((h) => h.tier === 'tentative');
        for (const t of tentatives) holds.delete(t.id);
        preemptedRefIds = tentatives.map((t) => t.refId);
      } else if (active.length > 0) {
        return err(conflictError('Эти даты уже заняты'));
      }
      const id = `h${(n += 1)}`;
      holds.set(id, { id, orgId, propertyId, from, to, tier, expiresAt, refId });
      return ok({ id, preemptedRefIds });
    },
    release: async (_orgId, holdId) => {
      holds.delete(holdId);
    },
    promote: async (_orgId, holdId) => {
      const h = holds.get(holdId);
      if (h) holds.set(holdId, { ...h, tier: 'firm', expiresAt: null });
    },
    releaseExpired: async () => {
      const now = new Date().toISOString();
      const expired = [...holds.values()].filter((h) => h.tier === 'tentative' && h.expiresAt !== null && h.expiresAt <= now);
      for (const h of expired) holds.delete(h.id);
      return expired.map((h) => ({ orgId: h.orgId, refId: h.refId }));
    },
  };
  return { port, holds };
};

export const createFakeReservationRepo = () => {
  const store = new Map<string, Reservation>();
  const repo: ReservationRepo = {
    save: async (r) => {
      store.set(r.id, r);
    },
    getById: async (orgId, id) => {
      const r = store.get(id);
      return r && r.orgId === orgId ? r : null;
    },
    getByExternalId: async (orgId, source: ReservationSource, externalId) =>
      [...store.values()].find(
        (r) => r.orgId === orgId && r.source === source && r.externalId === externalId,
      ) ?? null,
    listByProperty: async (orgId, propertyId) =>
      [...store.values()].filter((r) => r.orgId === orgId && r.propertyId === propertyId),
    getByGuestToken: async (token) => [...store.values()].find((r) => r.guestToken === token) ?? null,
    listConfirmedForCleaning: async () => [...store.values()].filter((r) => r.status === 'confirmed'),
    listConfirmedByOrg: async (orgId) =>
      [...store.values()].filter((r) => r.orgId === orgId && r.status === 'confirmed'),
  };
  return { repo, store };
};
