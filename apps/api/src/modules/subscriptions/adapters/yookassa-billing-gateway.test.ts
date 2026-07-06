import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { YooKassaClient } from '../../../shared/integrations/yookassa/client';
import { createYooKassaBillingGateway } from './yookassa-billing-gateway';

const CREDS = { shopId: 'platform-shop', secretKey: 'platform-secret' };
const INTENT = { orgId: 'org1', planId: 'plan1', returnUrl: 'https://app/return', idempotencyKey: 'idem-1' };

const fakeClient = (over: Partial<YooKassaClient> = {}): YooKassaClient => ({
  createPayment: vi.fn(() =>
    okAsync({
      id: 'pay_1',
      status: 'pending' as const,
      paid: false,
      amountMinor: 1000,
      currency: 'RUB',
      confirmationUrl: 'https://yoo/confirm',
      paymentMethodId: null,
      paymentMethodSaved: false,
      card: null,
    }),
  ),
  capturePayment: vi.fn(),
  cancelPayment: vi.fn(),
  getPayment: vi.fn(),
  ...over,
});

describe('createYooKassaBillingGateway.setupPaymentMethod', () => {
  it('создаёт auth-hold (capture:false, save_payment_method) и отдаёт redirect', async () => {
    const client = fakeClient();
    const gateway = createYooKassaBillingGateway({ client, credentials: CREDS, verificationAmountMinor: 1000, currency: 'RUB' });

    const r = await gateway.setupPaymentMethod(INTENT);

    const setup = r._unsafeUnwrap();
    expect(setup).toEqual({ kind: 'redirect', url: 'https://yoo/confirm', externalId: 'pay_1' });
    const params = (client.createPayment as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(params.capture).toBe(false);
    expect(params.savePaymentMethod).toBe(true);
    expect(params.amountMinor).toBe(1000);
    expect(params.idempotencyKey).toBe('idem-1');
    expect(params.metadata).toMatchObject({ orgId: 'org1', purpose: 'card_setup' });
  });

  it('сбой клиента → gateway_error', async () => {
    const client = fakeClient({ createPayment: () => errAsync({ code: 'yookassa_error', message: 'нет связи' }) });
    const gateway = createYooKassaBillingGateway({ client, credentials: CREDS, verificationAmountMinor: 1000, currency: 'RUB' });

    const r = await gateway.setupPaymentMethod(INTENT);
    expect(r._unsafeUnwrapErr()).toEqual({ code: 'gateway_error', message: 'нет связи' });
  });
});

describe('createYooKassaBillingGateway.getSetupResult', () => {
  it('waiting_for_capture → held + псевдо-отпечаток карты из БИН+хвоста+срока', async () => {
    const client = fakeClient({
      getPayment: () =>
        okAsync({
          id: 'pay_1',
          status: 'waiting_for_capture' as const,
          paid: false,
          amountMinor: 1000,
          currency: 'RUB',
          confirmationUrl: null,
          paymentMethodId: 'pm_1',
          paymentMethodSaved: true,
          card: { first6: '555555', last4: '4444', expiryYear: '2030', expiryMonth: '12' },
        }),
    });
    const gateway = createYooKassaBillingGateway({ client, credentials: CREDS, verificationAmountMinor: 1000, currency: 'RUB' });

    const r = await gateway.getSetupResult('pay_1');
    expect(r._unsafeUnwrap()).toEqual({ status: 'held', cardFingerprint: '5555554444203012', paymentMethodId: 'pm_1' });
  });

  it('canceled → failed', async () => {
    const client = fakeClient({
      getPayment: () =>
        okAsync({
          id: 'pay_1',
          status: 'canceled' as const,
          paid: false,
          amountMinor: 1000,
          currency: 'RUB',
          confirmationUrl: null,
          paymentMethodId: null,
          paymentMethodSaved: false,
          card: null,
        }),
    });
    const gateway = createYooKassaBillingGateway({ client, credentials: CREDS, verificationAmountMinor: 1000, currency: 'RUB' });

    const r = await gateway.getSetupResult('pay_1');
    expect(r._unsafeUnwrap().status).toBe('failed');
  });
});

describe('createYooKassaBillingGateway.releaseHold', () => {
  it('делегирует в cancelPayment с idempotencyKey', async () => {
    const cancelPayment = vi.fn(() =>
      okAsync({
        id: 'pay_1',
        status: 'canceled' as const,
        paid: false,
        amountMinor: 1000,
        currency: 'RUB',
        confirmationUrl: null,
        paymentMethodId: null,
        paymentMethodSaved: false,
        card: null,
      }),
    );
    const client = fakeClient({ cancelPayment });
    const gateway = createYooKassaBillingGateway({ client, credentials: CREDS, verificationAmountMinor: 1000, currency: 'RUB' });

    const r = await gateway.releaseHold('pay_1', 'idem-9');
    expect(r.isOk()).toBe(true);
    expect(cancelPayment).toHaveBeenCalledWith(CREDS, 'pay_1', 'idem-9');
  });
});
