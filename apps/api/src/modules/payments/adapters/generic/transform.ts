import { createHash, createHmac } from 'node:crypto';
import jsonata from 'jsonata';

/**
 * Трансформация generic-провайдера на JSONata. Один шаблон описывает весь маппинг, включая подпись
 * (в шаблон проброшены крипто-функции $hmacSha256/$hmacSha512/$md5 и переменная $secret):
 *  - inbound  : { body, headers, rawBody } → { signatureValid, paymentId, externalId, outcome, amountMinor };
 *  - outbound : { paymentId, amountMinor, amountMajor, currency, returnUrl, endpointUrl } → строка-URL.
 * Никакого хардкода контракта — адаптер лишь компилирует шаблоны аккаунта и зовёт inbound/outbound.
 */
export type InboundInput = { readonly headers: Record<string, string>; readonly rawBody: string };
export type InboundResult = {
  readonly signatureValid: boolean;
  readonly paymentId: string | null;
  readonly externalId: string;
  readonly outcome: 'succeeded' | 'failed' | 'refunded' | null;
  readonly amountMinor: number;
};
export type OutboundInput = {
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly returnUrl: string;
  readonly endpointUrl: string;
};
export type PaymentTransform = {
  readonly inbound: (input: InboundInput) => Promise<InboundResult>;
  readonly outbound: (input: OutboundInput) => Promise<string>;
};

const normalizeOutcome = (v: unknown): InboundResult['outcome'] =>
  v === 'succeeded' || v === 'failed' || v === 'refunded' ? v : null;

/** Тело вебхука как объект: JSON как есть, иначе form-urlencoded (словарь строк). */
const parseBodyAuto = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
};

export const DEFAULT_INBOUND_JSONATA = [
  '{',
  '  "signatureValid": $lowercase($lookup(headers, "x-signature")) = $hmacSha256(rawBody),',
  '  "paymentId": body.order,',
  '  "externalId": body.externalId ? body.externalId : body.order,',
  '  "outcome": body.status = "success" ? "succeeded" : body.status = "fail" ? "failed" : body.status = "refund" ? "refunded",',
  '  "amountMinor": $round(body.amount * 100)',
  '}',
].join('\n');

export const DEFAULT_OUTBOUND_JSONATA = [
  'endpointUrl & "?order=" & paymentId',
  '  & "&amount=" & $string(amountMajor)',
  '  & "&currency=" & currency',
  '  & "&return=" & $encodeUrlComponent(returnUrl)',
  '  & "&sign=" & $hmacSha256(paymentId & ":" & $string(amountMajor) & ":" & currency)',
].join('\n');

const cryptoBindings = (secret: string) => ({
  secret,
  hmacSha256: (p: unknown) => createHmac('sha256', secret).update(String(p)).digest('hex'),
  hmacSha512: (p: unknown) => createHmac('sha512', secret).update(String(p)).digest('hex'),
  md5: (p: unknown) => createHash('md5').update(String(p)).digest('hex'),
});

export const createTransform = (config: Record<string, string>, secret: string): PaymentTransform => {
  const inExpr = jsonata(config.inboundTemplate || DEFAULT_INBOUND_JSONATA);
  const outExpr = jsonata(config.outboundTemplate || DEFAULT_OUTBOUND_JSONATA);
  const bindings = cryptoBindings(secret);
  return {
    inbound: async ({ headers, rawBody }) => {
      const r = (await inExpr.evaluate({ body: parseBodyAuto(rawBody), headers, rawBody }, bindings)) as
        | Record<string, unknown>
        | undefined;
      return {
        signatureValid: Boolean(r?.signatureValid),
        paymentId: r?.paymentId != null ? String(r.paymentId) : null,
        externalId: r?.externalId != null ? String(r.externalId) : '',
        outcome: normalizeOutcome(r?.outcome),
        amountMinor: Math.round(Number(r?.amountMinor ?? 0)),
      };
    },
    outbound: async ({ paymentId, amountMinor, currency, returnUrl, endpointUrl }) => {
      const url = await outExpr.evaluate(
        { paymentId, amountMinor, amountMajor: amountMinor / 100, currency, returnUrl, endpointUrl },
        bindings,
      );
      return String(url ?? '');
    },
  };
};
