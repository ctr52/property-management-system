import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const listingKeys = {
  byProperty: (propertyId: string) => ['listings', propertyId] as const,
};

/** Объявления (связи с площадками) для объекта. */
export const usePropertyListings = (propertyId: string) =>
  useQuery({
    queryKey: listingKeys.byProperty(propertyId),
    queryFn: async () => {
      const res = await api.listings.property[':propertyId'].$get({ param: { propertyId } });
      if (!res.ok) {
        throw new Error('Не удалось загрузить объявления');
      }
      return res.json();
    },
  });
