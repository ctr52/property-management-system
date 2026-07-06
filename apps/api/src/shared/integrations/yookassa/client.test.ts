import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { createYooKassaClient, toPayment, type HttpJson, type YooKassaCredentials } from './client';

const CREDS: YooKassaCredentials = { shopId: 'shop1', secretKey: 'secret1' };

const dto = (over: Record<string, unknown> = {}) => ({
  id: 'pay_1',
  status: 'waiting_for_capture',
  paid: false,
  amount: { value: '10.00', currency: 'RUB' },
  confirmation: { type: 'redirect', confirmation_url: 'https://yoo/confirm' },
  payment_method: { id: 'pm_1', saved: true, card: { first6: '555555', last4: '4444', expiry_year: '2030', expiry_month: '12' } },
  ...over,
});

describe('toPayment', () => {
  it('маппит DTO в нормализованный платёж (сумма в minor, карта, confirmationUrl)', () => {
    const p = toPayment(dto())!;
    expect(p.id).toBe('pay_1');
    expect(p.status).toBe('waiting_for_capture');
    expect(p.amountMinor).toBe(1000);
    expect(p.confirmationUrl).toBe('https://yoo/confirm');
    expect(p.paymentMethodId).toBe('pm_1');
    expect(p.paymentMethodSaved).toBe(true);
    expect(p.card?.last4).toBe('4444');
  });

  it('без payment_method → card/paymentMethodId null', () => {
    const p = toPayment(dto({ payment_method: undefined }))!;
    expect(p.card).toBeNull();
    expect(p.paymentMethodId).toBeNull();
  });

  it('мусор → null', () => {
    expect(toPayment(null)).toBeNull();
    expect(toPayment({ id: 'x' })).toBeNull(); // нет status
  });
});

describe('createYooKassaClient.createPayment', () => {
  it('шлёт Basic-auth + Idempotence-Key, capture:false для auth-hold', async () => {
    const http = vi.fn<HttpJson>(() => okAsync({ status: 200, json: dto() }));
    const client = createYooKassaClient({ apiBase: 'https://api.yookassa.ru/v3', http });

    const r = await client.createPayment(CREDS, {
      amountMinor: 1000,
      currency: 'RUB',
      capture: false,
      returnUrl: 'https://app/return',
      description: 'Привязка карты',
      savePaymentMethod: true,
      metadata: { orgId: 'org1' },
      idempotencyKey: 'idem-1',
    });

    expect(r._unsafeUnwrap().confirmationUrl).toBe('https://yoo/confirm');
    const req = http.mock.calls[0]![0];
    expect(req.url).toBe('https://api.yookassa.ru/v3/payments');
    expect(req.headers.authorization).toBe(`Basic ${Buffer.from('shop1:secret1').toString('base64')}`);
    expect(req.headers['idempotence-key']).toBe('idem-1');
    const body = JSON.parse(req.body!);
    expect(body.capture).toBe(false);
    expect(body.save_payment_method).toBe(true);
    expect(body.amount).toEqual({ value: '10.00', currency: 'RUB' });
    expect(body.confirmation).toEqual({ type: 'redirect', return_url: 'https://app/return' });
  });

  it('рекуррент: payment_method_id вместо confirmation', async () => {
    const http = vi.fn<HttpJson>(() => okAsync({ status: 200, json: dto({ status: 'succeeded', paid: true }) }));
    const client = createYooKassaClient({ apiBase: 'https://api.yookassa.ru/v3', http });

    await client.createPayment(CREDS, {
      amountMinor: 290000,
      currency: 'RUB',
      capture: true,
      returnUrl: 'https://app/return',
      description: 'Подписка',
      paymentMethodId: 'pm_1',
      idempotencyKey: 'idem-2',
    });

    const body = JSON.parse(http.mock.calls[0]![0].body!);
    expect(body.payment_method_id).toBe('pm_1');
    expect(body.confirmation).toBeUndefined();
  });

  it('HTTP 4xx → yookassa_error со статусом', async () => {
    const http = vi.fn<HttpJson>(() => okAsync({ status: 400, json: { description: 'Invalid' } }));
    const client = createYooKassaClient({ apiBase: 'https://api.yookassa.ru/v3', http });

    const r = await client.createPayment(CREDS, {
      amountMinor: 1000,
      currency: 'RUB',
      capture: false,
      returnUrl: 'https://app/return',
      description: 'x',
      idempotencyKey: 'idem-3',
    });

    expect(r._unsafeUnwrapErr().status).toBe(400);
  });
});
