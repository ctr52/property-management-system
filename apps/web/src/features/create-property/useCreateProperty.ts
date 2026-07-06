import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePropertyRequest } from '@pms/shared';
import { api } from '../../shared/api/client';
import { propertyKeys } from '../../entities/property';

/**
 * Действие: создать объект. По успеху инвалидирует список —
 * любой виджет с ключом propertyKeys.all сам перезапросит данные.
 */
export const useCreateProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePropertyRequest) => {
      const res = await api.properties.$post({ json: input });
      if (!res.ok) {
        throw new Error('Не удалось создать объект');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: propertyKeys.all });
    },
  });
};
