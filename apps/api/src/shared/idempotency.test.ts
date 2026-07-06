import { describe, expect, it } from 'vitest';
import { gatewayIdempotencyKey } from './idempotency';

describe('gatewayIdempotencyKey', () => {
  it('укладывается в лимит ЮKassa (≤64) даже для UUID + ISO-даты', () => {
    const key = gatewayIdempotencyKey('pay', '00000000-0000-0000-0000-000000000001', '2026-08-12T00:00:00.000Z');
    expect(key.length).toBeLessThanOrEqual(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it('детерминирован: один вход → один ключ', () => {
    expect(gatewayIdempotencyKey('pay', 'org1', 'end1')).toBe(gatewayIdempotencyKey('pay', 'org1', 'end1'));
  });

  it('изменившийся вход → другой ключ (новое списание разрешено)', () => {
    expect(gatewayIdempotencyKey('pay', 'org1', 'end1')).not.toBe(gatewayIdempotencyKey('pay', 'org1', 'end2'));
  });
});
