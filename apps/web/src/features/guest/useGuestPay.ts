import { useMutation } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

/** Гость инициирует оплату ноги → redirectUrl (фронт делает window.location). */
export const useGuestPay = (token: string) =>
  useMutation({
    mutationFn: async (legId: string) => {
      const res = await api.guest[':token'].pay[':legId'].$post({ param: { token, legId } });
      if (!res.ok) throw new Error('Оплата недоступна');
      return res.json();
    },
  });
