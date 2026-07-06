import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateReservationRequest } from '@pms/shared';
import { api } from '../../shared/api/client';
import { reservationKeys } from '../../entities/reservation';

const extractMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
};

export const useCreateReservation = (propertyId: string) => {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: reservationKeys.byProperty(propertyId) });
    void queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };
  return useMutation({
    mutationFn: async (input: CreateReservationRequest) => {
      const res = await api.reservations.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось создать бронь'));
      return res.json();
    },
    onSuccess: invalidate,
  });
};

export const useCancelReservation = (propertyId: string) => {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: reservationKeys.byProperty(propertyId) });
    void queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.reservations[':id'].cancel.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось отменить бронь');
      return res.json();
    },
    onSuccess: invalidate,
  });
};
