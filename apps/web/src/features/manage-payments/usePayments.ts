import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BuildDirectPlanInput, ConnectProviderInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { paymentKeys } from '../../entities/payment';

const extractMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
};

export const useConnectProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectProviderInput) => {
      const res = await api.payments.accounts.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось подключить провайдера'));
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: paymentKeys.accounts }),
  });
};

export const useDisconnectProvider = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.payments.accounts[':id'].disconnect.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось отключить провайдера');
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: paymentKeys.accounts }),
  });
};

export const useBuildPlan = (reservationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BuildDirectPlanInput) => {
      const res = await api.payments.plans.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось создать план'));
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: paymentKeys.reservation(reservationId) }),
  });
};

/** Инициировать онлайн-оплату → redirectUrl (фронт делает window.location). */
export const useInitPayment = () =>
  useMutation({
    mutationFn: async (input: { reservationId: string; legId: string }) => {
      const res = await api.payments.init.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось инициировать оплату'));
      return res.json();
    },
  });

/** Ручное подтверждение (manual-провайдер). */
export const useConfirmManual = (reservationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reservationId: string; legId: string }) => {
      const res = await api.payments['confirm-manual'].$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось подтвердить оплату'));
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: paymentKeys.reservation(reservationId) }),
  });
};
