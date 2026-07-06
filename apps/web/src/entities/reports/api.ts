import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const reportKeys = {
  byRange: (from: string, to: string) => ['reports', from, to] as const,
};

/** Отчёт по загрузке/выручке за период [from, to). Включается, когда период валиден. */
export const useReport = (from: string, to: string) =>
  useQuery({
    queryKey: reportKeys.byRange(from, to),
    enabled: Boolean(from && to && from < to),
    queryFn: async () => {
      const res = await api.reports.$get({ query: { from, to } });
      if (!res.ok) throw new Error('Не удалось загрузить отчёт');
      return res.json();
    },
  });
