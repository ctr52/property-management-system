import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePriceRuleRequest, SetPriceOverrideInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { pricingKeys } from '../../entities/pricing';

const extractMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
};

/** Прайсинг влияет и на календарь (цена за ночь) → инвалидируем оба ключа. */
const useInvalidatePricing = (propertyId: string) => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: pricingKeys.byProperty(propertyId) });
    void queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };
};

export const useCreateRule = (propertyId: string) => {
  const invalidate = useInvalidatePricing(propertyId);
  return useMutation({
    mutationFn: async (input: CreatePriceRuleRequest) => {
      const res = await api.pricing.rules.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось создать правило'));
      return res.json();
    },
    onSuccess: invalidate,
  });
};

export const useRemoveRule = (propertyId: string) => {
  const invalidate = useInvalidatePricing(propertyId);
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.pricing.rules[':id'].remove.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось удалить правило');
      return res.json();
    },
    onSuccess: invalidate,
  });
};

export const useSetOverride = (propertyId: string) => {
  const invalidate = useInvalidatePricing(propertyId);
  return useMutation({
    mutationFn: async (input: SetPriceOverrideInput) => {
      const res = await api.pricing.overrides.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось задать цену'));
      return res.json();
    },
    onSuccess: invalidate,
  });
};

export const useRemoveOverride = (propertyId: string) => {
  const invalidate = useInvalidatePricing(propertyId);
  return useMutation({
    mutationFn: async (input: { propertyId: string; date: string }) => {
      const res = await api.pricing.overrides.remove.$post({ json: input });
      if (!res.ok) throw new Error('Не удалось убрать цену');
      return res.json();
    },
    onSuccess: invalidate,
  });
};
