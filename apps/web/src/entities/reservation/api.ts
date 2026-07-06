import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const reservationKeys = {
  byProperty: (propertyId: string) => ['reservations', propertyId] as const,
};

/** Брони объекта. */
export const usePropertyReservations = (propertyId: string) =>
  useQuery({
    queryKey: reservationKeys.byProperty(propertyId),
    queryFn: async () => {
      const res = await api.reservations.property[':propertyId'].$get({ param: { propertyId } });
      if (!res.ok) {
        throw new Error('Не удалось загрузить брони');
      }
      return res.json();
    },
  });
