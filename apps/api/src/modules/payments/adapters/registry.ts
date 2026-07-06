import type { PaymentProvider } from '@pms/shared';
import type { PaymentProviderAdapter } from '../ports/provider';
import type { PaymentProviderRegistry } from '../ports/repos';

/**
 * Реестр платёжных адаптеров (аналог channel AdapterRegistry) — источник правды о множестве
 * рельсов вместо закрытого enum (ADR-0002). get резолвит по open string-id, list питает
 * GET /payments/providers (манифесты).
 */
export const createPaymentProviderRegistry = (
  adapters: readonly PaymentProviderAdapter[],
): PaymentProviderRegistry => {
  const byId = new Map<PaymentProvider, PaymentProviderAdapter>(adapters.map((a) => [a.provider, a]));
  return {
    get: (provider) => byId.get(provider),
    list: () => [...byId.values()],
  };
};
