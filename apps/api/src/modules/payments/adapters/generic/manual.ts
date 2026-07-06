import { errAsync } from 'neverthrow';
import type { ProviderManifest } from '@pms/shared';
import type { PaymentProviderAdapter } from '../../ports/provider';

/**
 * Manual / offline-провайдер: оплата вне системы (счёт, перевод по реквизитам).
 * Онлайн-инициации нет — initPayment не поддерживается; ногу закрывает менеджер через
 * confirmManualPayment (permission payment:confirm, запись в audit log). Honest fallback,
 * когда у ПС нет пригодного API (ADR-0002).
 */
export const MANUAL_PROVIDER = 'manual';

const manifest: ProviderManifest = {
  id: MANUAL_PROVIDER,
  title: 'Вне системы (ручное подтверждение)',
  kind: 'manual',
  capabilities: { refunds: false, recurring: false, receipts: false, ingest: 'none' },
  connectSchema: [
    { key: 'displayName', label: 'Название способа оплаты', secret: false, required: true, kind: 'text' },
    { key: 'instructions', label: 'Инструкция гостю (реквизиты)', secret: false, required: true, kind: 'text' },
  ],
};

export const createManualAdapter = (): PaymentProviderAdapter => ({
  provider: MANUAL_PROVIDER,
  manifest,
  capabilities: manifest.capabilities,
  initPayment: () => errAsync({ code: 'unsupported', message: 'manual-провайдер не инициирует онлайн-оплату' }),
  ingest: { mode: 'none' },
});
