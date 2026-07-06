import type { CleaningStatus } from '@pms/shared';
import { useMyCleaning } from '../../entities/cleaning';
import { useProperties } from '../../entities/property';
import { useCompleteCleaning, useStartCleaning } from '../../features/manage-cleaning/useCleaning';
import { Button, Card, Stack, Text } from '../../shared/ui';

const statusLabel: Record<CleaningStatus, string> = {
  todo: 'не назначена',
  assigned: 'назначена',
  in_progress: 'в работе',
  done: 'готово',
  cancelled: 'отменена',
};

/** Мои задачи уборки (клинер): взять в работу / завершить. */
export const MyCleaning = () => {
  const mine = useMyCleaning();
  const properties = useProperties();
  const start = useStartCleaning();
  const complete = useCompleteCleaning();

  const propTitle = (id: string) => properties.data?.find((p) => p.id === id)?.title ?? id.slice(0, 8);

  return (
    <Stack gap={2}>
      {mine.isLoading && <Text>Загрузка…</Text>}
      {mine.data && mine.data.length === 0 && <Text muted>Назначенных задач нет.</Text>}
      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {mine.data?.map((t) => (
          <Card as="li" key={t.id}>
            <Stack direction="row" justify="space-between" align="center">
              <Stack gap={1}>
                <Text weight={600}>
                  {propTitle(t.propertyId)} · {t.date}
                </Text>
                <Text size="sm" muted>
                  {t.guestName ?? 'ручная'} · {statusLabel[t.status]}
                </Text>
              </Stack>
              {t.status === 'assigned' && (
                <Button disabled={start.isPending} onClick={() => start.mutate(t.id)}>
                  Взять в работу
                </Button>
              )}
              {t.status === 'in_progress' && (
                <Button disabled={complete.isPending} onClick={() => complete.mutate(t.id)}>
                  Завершить
                </Button>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};
