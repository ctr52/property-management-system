import { useState } from 'react';
import type { CleanerView, CleaningStatus } from '@pms/shared';
import { useCleaners, useCleaningBoard } from '../../entities/cleaning';
import { useProperties } from '../../entities/property';
import { useAssignCleaning } from '../../features/manage-cleaning/useCleaning';
import { Button, Card, Select, Stack, Text } from '../../shared/ui';

const statusLabel: Record<CleaningStatus, string> = {
  todo: 'не назначена',
  assigned: 'назначена',
  in_progress: 'в работе',
  done: 'готово',
  cancelled: 'отменена',
};

const AssignControl = ({ taskId, cleaners }: { taskId: string; cleaners: CleanerView[] }) => {
  const assign = useAssignCleaning();
  const [sel, setSel] = useState('');
  const value = sel || cleaners[0]?.id || '';
  if (cleaners.length === 0) return <Text size="sm" muted>Нет клинеров</Text>;
  return (
    <Stack direction="row" gap={1} align="center">
      <Select value={value} onChange={(e) => setSel(e.target.value)}>
        {cleaners.map((c) => (
          <option key={c.id} value={c.id}>
            {c.email}
          </option>
        ))}
      </Select>
      <Button disabled={assign.isPending} onClick={() => value && assign.mutate({ id: taskId, assigneeId: value })}>
        Назначить
      </Button>
    </Stack>
  );
};

/** Доска уборок (менеджер): авто-генерируется от выездов; назначение клинера. */
export const CleaningBoard = () => {
  const board = useCleaningBoard();
  const cleaners = useCleaners();
  const properties = useProperties();

  const propTitle = (id: string) => properties.data?.find((p) => p.id === id)?.title ?? id.slice(0, 8);
  const cleanerEmail = (id: string | null) =>
    id ? cleaners.data?.find((c) => c.id === id)?.email ?? id.slice(0, 8) : '—';

  return (
    <Stack gap={2}>
      {board.isLoading && <Text>Загрузка…</Text>}
      {board.data && board.data.length === 0 && (
        <Text muted>Задач нет — появятся автоматически от подтверждённых выездов.</Text>
      )}
      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {board.data?.map((t) => (
          <Card as="li" key={t.id}>
            <Stack direction="row" justify="space-between" align="center" css={{ flexWrap: 'wrap', gap: 8 }}>
              <Stack gap={1}>
                <Text weight={600}>
                  {propTitle(t.propertyId)} · {t.date}
                </Text>
                <Text size="sm" muted>
                  {t.guestName ?? 'ручная'} · {statusLabel[t.status]} · клинер: {cleanerEmail(t.assigneeId)}
                </Text>
              </Stack>
              {(t.status === 'todo' || t.status === 'assigned') && (
                <AssignControl taskId={t.id} cleaners={cleaners.data ?? []} />
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};
