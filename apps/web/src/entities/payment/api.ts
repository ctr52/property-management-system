import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const paymentKeys = {
  providers: ['payment-providers'] as const,
  accounts: ['payment-accounts'] as const,
  reservation: (reservationId: string) => ['payments', reservationId] as const,
};

/** Манифесты доступных провайдеров (рельсы + connectSchema для формы подключения). */
export const usePaymentProviders = () =>
  useQuery({
    queryKey: paymentKeys.providers,
    queryFn: async () => {
      const res = await api.payments.providers.$get();
      if (!res.ok) throw new Error('Не удалось загрузить провайдеров');
      return res.json();
    },
  });

/** Подключённые платёжные аккаунты организации. */
export const usePaymentAccounts = () =>
  useQuery({
    queryKey: paymentKeys.accounts,
    queryFn: async () => {
      const res = await api.payments.accounts.$get();
      if (!res.ok) throw new Error('Не удалось загрузить аккаунты');
      return res.json();
    },
  });

/** Платежи брони. */
export const useReservationPayments = (reservationId: string) =>
  useQuery({
    queryKey: paymentKeys.reservation(reservationId),
    queryFn: async () => {
      const res = await api.payments.reservations[':reservationId'].payments.$get({
        param: { reservationId },
      });
      if (!res.ok) throw new Error('Не удалось загрузить платежи');
      return res.json();
    },
  });
