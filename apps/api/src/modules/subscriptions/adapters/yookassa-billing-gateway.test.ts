import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { YooKassaClient, YooKassaPayment, YooKassaPaymentMethod } from '../../../shared/integrations/yookassa/client';
import { createYooKassaBillingGateway } from './yookassa-billing-gateway';

const CREDS = { shopId: 'platform-shop', secretKey: 'platform-secret' };

const payment = (over: Partial<YooKassaPayment> = {}): YooKassaPayment => ({
  id: 'pay_1',
  status: 'succeeded',
  paid: true,
  amountMinor: 290000,
  currency: 'RUB',
  confirmationUrl: 'https://yoo/confirm',
  paymentMethodId: 'pm_1',
  paymentMethodSaved: true,
  card: { first6: '555555', last4: '4444', expiryYear: '2030', expiryMonth: '12' },
  ...over,
});

const method = (over: Partial<YooKassaPaymentMethod> = {}): YooKassaPaymentMethod => ({
  id: 'pm_1',
  status: 'active',
  confirmationUrl: 'https://yoo/bind',
  card: { first6: '555555', last4: '4444', expiryYear: '2030', expiryMonth: '12' },
  ...over,
});

const fakeClient = (over: Partial<YooKassaClient> = {}): YooKassaClient => ({
  createPayment: vi.fn(() => okAsync(payment({ status: 'pending', confirmationUrl: 'https://yoo/pay' }))),
  capturePayment: vi.fn(),
  cancelPayment: vi.fn(),
  getPayment: vi.fn(() => okAsync(payment())),
  createPaymentMethod: vi.fn(() => okAsync(method({ status: 'pending' }))),
  getPaymentMethod: vi.fn(() => okAsync(method())),
  ...over,
});

const gw = (client: YooKassaClient) => createYooKassaBillingGateway({ client, credentials: CREDS });

describe('bindCard (zero-amount привязка)', () => {
  it('создаёт /payment_methods и отдаёт redirect + externalId', async () => {
    const client = fakeClient();
    const r = await gw(client).bindCard({ orgId: 'org1', planId: 'plan1', returnUrl: 'https://app/return', idempotencyKey: 'k1' });
    expect(r._unsafeUnwrap()).toEqual({ kind: 'redirect', url: 'https://yoo/bind', externalId: 'pm_1' });
    expect(client.createPaymentMethod).toHaveBeenCalledOnce();
  });

  it('сбой клиента → gateway_error', async () => {
    const client = fakeClient({ createPaymentMethod: () => errAsync({ code: 'yookassa_error', message: 'нет связи' }) });
    const r = await gw(client).bindCard({ orgId: 'org1', planId: 'plan1', returnUrl: 'https://app/return', idempotencyKey: 'k1' });
    expect(r._unsafeUnwrapErr()).toEqual({ code: 'gateway_error', message: 'нет связи' });
  });
});

describe('getCardBinding', () => {
  it('active → active + отпечаток карты + paymentMethodId', async () => {
    const r = await gw(fakeClient()).getCardBinding('pm_1');
    expect(r._unsafeUnwrap()).toEqual({ status: 'active', cardFingerprint: '5555554444203012', paymentMethodId: 'pm_1' });
  });

  it('pending → pending, methodId ещё null', async () => {
    const client = fakeClient({ getPaymentMethod: () => okAsync(method({ status: 'pending' })) });
    const r = await gw(client).getCardBinding('pm_1');
    expect(r._unsafeUnwrap()).toMatchObject({ status: 'pending', paymentMethodId: null });
  });

  it('inactive → failed', async () => {
    const client = fakeClient({ getPaymentMethod: () => okAsync(method({ status: 'inactive' })) });
    expect((await gw(client).getCardBinding('pm_1'))._unsafeUnwrap().status).toBe('failed');
  });
});

describe('checkoutPeriod (прямая оплата)', () => {
  it('создаёт платёж на стоимость плана (capture:true, save) и отдаёт redirect', async () => {
    const client = fakeClient();
    const r = await gw(client).checkoutPeriod({
      orgId: 'org1', planId: 'plan1', amountMinor: 290000, currency: 'RUB', returnUrl: 'https://app/return', idempotencyKey: 'k2',
    });
    expect(r._unsafeUnwrap()).toEqual({ kind: 'redirect', url: 'https://yoo/pay', externalId: 'pay_1' });
    const params = (client.createPayment as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(params.capture).toBe(true);
    expect(params.savePaymentMethod).toBe(true);
    expect(params.amountMinor).toBe(290000);
  });
});

describe('getPeriodPayment', () => {
  it('succeeded → succeeded + paymentMethodId (карта сохранена)', async () => {
    const r = await gw(fakeClient()).getPeriodPayment('pay_1');
    expect(r._unsafeUnwrap()).toMatchObject({ status: 'succeeded', paymentMethodId: 'pm_1' });
  });

  it('canceled → canceled', async () => {
    const client = fakeClient({ getPayment: () => okAsync(payment({ status: 'canceled' })) });
    expect((await gw(client).getPeriodPayment('pay_1'))._unsafeUnwrap().status).toBe('canceled');
  });
});

describe('charge (рекуррент по сохранённой карте)', () => {
  it('succeeded → succeeded, шлёт payment_method_id', async () => {
    const client = fakeClient({ createPayment: vi.fn(() => okAsync(payment({ status: 'succeeded' }))) });
    const r = await gw(client).charge({ methodRef: 'pm_1', amountMinor: 290000, currency: 'RUB', description: 'Подписка', idempotencyKey: 'k3' });
    expect(r._unsafeUnwrap().status).toBe('succeeded');
    const params = (client.createPayment as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(params.paymentMethodId).toBe('pm_1');
    expect(params.capture).toBe(true);
  });

  it('canceled → declined', async () => {
    const client = fakeClient({ createPayment: () => okAsync(payment({ status: 'canceled' })) });
    expect((await gw(client).charge({ methodRef: 'pm_1', amountMinor: 1, currency: 'RUB', description: 'x', idempotencyKey: 'k4' }))._unsafeUnwrap().status).toBe('declined');
  });
});
