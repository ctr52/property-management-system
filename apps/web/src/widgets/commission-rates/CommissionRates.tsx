import { useState } from 'react';
import type { CommissionRule } from '../../entities/commissions';
import { useCommissionRules } from '../../entities/commissions';
import { useSetCommissionRule } from '../../features/manage-commissions/useCommissions';
import { Button, Card, Input, Stack, Text } from '../../shared/ui';

type Source = CommissionRule['source'];

const SOURCES: { value: Source; label: string }[] = [
  { value: 'avito', label: 'Avito' },
  { value: 'cian', label: 'Циан' },
  { value: 'direct', label: 'Прямые брони' },
];

const RateRow = ({ source, label, rule }: { source: Source; label: string; rule: CommissionRule | undefined }) => {
  const set = useSetCommissionRule();
  const [percent, setPercent] = useState(String((rule?.percentBips ?? 0) / 100));
  const [fixed, setFixed] = useState(String((rule?.fixedMinor ?? 0) / 100));

  const save = () =>
    set.mutate({
      source,
      percentBips: Math.round(Number(percent || 0) * 100),
      fixedMinor: Math.round(Number(fixed || 0) * 100),
    });

  return (
    <Card as="li">
      <Stack direction="row" gap={3} align="flex-end">
        <Stack gap={1} css={{ flex: 1 }}>
          <Text weight={600}>{label}</Text>
        </Stack>
        <Stack gap={1}>
          <Text size="sm" muted>
            Процент, %
          </Text>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            css={{ width: 100 }}
          />
        </Stack>
        <Stack gap={1}>
          <Text size="sm" muted>
            Фикс, ₽
          </Text>
          <Input
            type="number"
            min="0"
            value={fixed}
            onChange={(e) => setFixed(e.target.value)}
            css={{ width: 100 }}
          />
        </Stack>
        <Button type="button" variant="secondary" disabled={set.isPending} onClick={save}>
          {set.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </Stack>
      {set.isError && <Text css={(t) => ({ color: t.colors.danger })}>{set.error.message}</Text>}
    </Card>
  );
};

/** Ставки комиссий площадок per-channel. Виджет владеет своими данными. */
export const CommissionRates = () => {
  const rules = useCommissionRules();
  const bySource = new Map((rules.data ?? []).map((r) => [r.source, r]));

  return (
    <Stack gap={2}>
      <Text weight={600}>Ставки комиссий по каналам</Text>
      {rules.isLoading && <Text>Загрузка…</Text>}
      {rules.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}
      {rules.data && (
        <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {SOURCES.map((s) => (
            <RateRow key={s.value} source={s.value} label={s.label} rule={bySource.get(s.value)} />
          ))}
        </Stack>
      )}
    </Stack>
  );
};
