import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

/** Ключи кэша объекта — единая точка для инвалидации между виджетами. */
export const propertyKeys = {
  all: ['properties'] as const,
  detail: (id: string) => ['property', id] as const,
};

/** Один объект по id. */
export const useProperty = (id: string) =>
  useQuery({
    queryKey: propertyKeys.detail(id),
    queryFn: async () => {
      const res = await api.properties[':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('Объект не найден');
      }
      return res.json();
    },
  });

/** Чтение списка объектов. Виджет сам вызывает этот хук — без проброса данных. */
export const useProperties = () =>
  useQuery({
    queryKey: propertyKeys.all,
    queryFn: async () => {
      const res = await api.properties.$get();
      if (!res.ok) {
        throw new Error('Не удалось загрузить объекты');
      }
      return res.json();
    },
  });
