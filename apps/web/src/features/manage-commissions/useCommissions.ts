import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SetCommissionRuleInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { commissionKeys } from '../../entities/commissions';

const extractMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
};

/** Ставка комиссии влияет и на отчёт по комиссиям → инвалидируем оба ключа. */
export const useSetCommissionRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetCommissionRuleInput) => {
      const res = await api.commissions.rules.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось сохранить ставку'));
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commissionKeys.rules });
      void queryClient.invalidateQueries({ queryKey: ['commissions', 'report'] });
    },
  });
};
