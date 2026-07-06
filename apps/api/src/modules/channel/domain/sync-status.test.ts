import { describe, expect, it } from 'vitest';
import { applyConfirmation, deriveSyncStatus, markOutdated, markPushed } from './sync-status';
import type { ListingLink } from './types';

const baseLink: ListingLink = {
  id: 'l1',
  orgId: 'o1',
  propertyId: 'p1',
  platform: 'avito',
  mode: 'managed',
  externalId: 'ext1',
  platformListingId: null,
  phase: 'queued',
  desiredRevision: 1,
  pushedRevision: null,
  appliedRevision: null,
  lastPushedAt: null,
  lastConfirmedAt: null,
  lastError: null,
};

describe('deriveSyncStatus (честность статуса)', () => {
  it('фаза error → error', () => {
    expect(deriveSyncStatus({ phase: 'error', desiredRevision: 1, appliedRevision: null }, 'poll')).toBe('error');
  });
  it('feedback=none + pushed → sent_unconfirmed (не врём про up_to_date)', () => {
    expect(deriveSyncStatus({ phase: 'pushed', desiredRevision: 1, appliedRevision: null }, 'none')).toBe(
      'sent_unconfirmed',
    );
  });
  it('applied на актуальной ревизии → up_to_date', () => {
    expect(deriveSyncStatus({ phase: 'applied', desiredRevision: 2, appliedRevision: 2 }, 'poll')).toBe('up_to_date');
  });
  it('applied на устаревшей ревизии (есть свежая правка) → syncing', () => {
    expect(deriveSyncStatus({ phase: 'applied', desiredRevision: 3, appliedRevision: 2 }, 'poll')).toBe('syncing');
  });
  it('queued → syncing', () => {
    expect(deriveSyncStatus({ phase: 'queued', desiredRevision: 1, appliedRevision: null }, 'poll')).toBe('syncing');
  });
});

describe('переходы ListingLink (pure)', () => {
  it('markPushed: pushedRevision = desiredRevision, фаза pushed', () => {
    const l = markPushed(baseLink, '2026-06-25T00:00:00Z');
    expect(l.phase).toBe('pushed');
    expect(l.pushedRevision).toBe(1);
  });
  it('markOutdated: desiredRevision++ и возврат в queued', () => {
    const l = markOutdated({ ...baseLink, phase: 'applied', desiredRevision: 1 });
    expect(l.desiredRevision).toBe(2);
    expect(l.phase).toBe('queued');
  });
  it('applyConfirmation applied: appliedRevision и platformListingId', () => {
    const l = applyConfirmation(markPushed(baseLink, 'now'), {
      externalId: 'ext1',
      outcome: 'applied',
      platformListingId: 'AV-9',
    }, 'now');
    expect(l.phase).toBe('applied');
    expect(l.appliedRevision).toBe(1);
    expect(l.platformListingId).toBe('AV-9');
  });
  it('applyConfirmation error: phase error + lastError', () => {
    const l = applyConfirmation(baseLink, { externalId: 'ext1', outcome: 'error', error: 'отклонено' }, 'now');
    expect(l.phase).toBe('error');
    expect(l.lastError).toBe('отклонено');
  });
});
