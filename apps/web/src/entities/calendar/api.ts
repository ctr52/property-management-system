import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const calendarKeys = {
  range: (from: string, to: string) => ['calendar', from, to] as const,
};

/** Календарь объектов за диапазон дат. */
export const useCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: calendarKeys.range(from, to),
    queryFn: async () => {
      const res = await api.calendar.$get({ query: { from, to } });
      if (!res.ok) {
        throw new Error('Не удалось загрузить календарь');
      }
      return res.json();
    },
  });
