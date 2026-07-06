import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachListingInput, CreateListingInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { listingKeys } from '../../entities/listing';

const useInvalidate = (propertyId: string) => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: listingKeys.byProperty(propertyId) });
};

/** Создать объявление через платформу (managed). */
export const useCreateListing = (propertyId: string) => {
  const invalidate = useInvalidate(propertyId);
  return useMutation({
    mutationFn: async (input: CreateListingInput) => {
      const res = await api.listings.$post({ json: input });
      if (!res.ok) throw new Error('Не удалось создать объявление');
      return res.json();
    },
    onSuccess: () => void invalidate(),
  });
};

/** Привязать существующее объявление (attached). */
export const useAttachListing = (propertyId: string) => {
  const invalidate = useInvalidate(propertyId);
  return useMutation({
    mutationFn: async (input: AttachListingInput) => {
      const res = await api.listings.attach.$post({ json: input });
      if (!res.ok) throw new Error('Не удалось привязать объявление');
      return res.json();
    },
    onSuccess: () => void invalidate(),
  });
};

/** Удалить связь с объявлением. */
export const useRemoveListing = (propertyId: string) => {
  const invalidate = useInvalidate(propertyId);
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.listings[':id'].remove.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось удалить объявление');
      return res.json();
    },
    onSuccess: () => void invalidate(),
  });
};
