import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdatePropertyInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { propertyKeys } from '../../entities/property';

/** Действие: изменить название/цену объекта. По успеху инвалидирует список. */
export const useEditProperty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { id: string; patch: UpdatePropertyInput }) => {
      const res = await api.properties[':id'].$patch({
        param: { id: vars.id },
        json: vars.patch,
      });
      if (!res.ok) {
        throw new Error('Не удалось сохранить изменения');
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: propertyKeys.all });
      void queryClient.invalidateQueries({ queryKey: propertyKeys.detail(vars.id) });
    },
  });
};
