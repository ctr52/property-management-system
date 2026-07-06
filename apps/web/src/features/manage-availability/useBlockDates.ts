import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateBlockInput } from '@pms/shared';
import { api } from '../../shared/api/client';

/** Закрыть даты (ручная блокировка). Инвалидирует календарь. */
export const useCreateBlock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBlockInput) => {
      const res = await api.availability.blocks.$post({ json: input });
      if (!res.ok) {
        throw new Error('Не удалось заблокировать даты');
      }
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['calendar'] }),
  });
};

/** Снять ручную блокировку по id hold'а. */
export const useRemoveBlock = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.availability.blocks[':id'].remove.$post({ param: { id } });
      if (!res.ok) {
        throw new Error('Не удалось снять блокировку');
      }
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['calendar'] }),
  });
};
