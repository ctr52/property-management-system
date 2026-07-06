import { useState } from 'react';
import type { CommissionReport as Report, CommissionReportRow } from '../../entities/commissions';
import { useCommissionReport } from '../../entities/commissions';
import { Card, Input, Stack, Text } from '../../shared/ui';

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

const sourceLabel: Record<CommissionReportRow['source'], string> = {
  avito: 'Avito',
  cian: 'Циан',
  direct: 'Прямые',
};

const monthRange = (): { from: string; to: string } => {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};

const Row = ({ row, currency }: { row: CommissionReportRow; currency: string }) => (
  <Card as="li">
    <Stack direction="row" justify="space-between" align="center" gap={2}>
      <Stack gap={1}>
        <Text weight={600}>{sourceLabel[row.source]}</Text>
        <Text size="sm" muted>
          {row.bookings} брон. ·{' '}
          {row.percentBips === null
            ? 'без комиссии'
            : `${row.percentBips / 100}%${row.fixedMinor ? ` + ${formatMoney(row.fixedMinor, currency)}` : ''}`}
        </Text>
      </Stack>
      <Stack gap={1} align="flex-end">
        <Text weight={600}>− {formatMoney(row.commissionMinor, currency)}</Text>
        <Text size="sm" muted>
          с {formatMoney(row.grossMinor, currency)} · чистыми {formatMoney(row.netMinor, currency)}
        </Text>
      </Stack>
    </Stack>
  </Card>
);

const Body = ({ report }: { report: Report }) => (
  <>
    <Card css={(t) => ({ borderColor: t.colors.link })}>
      <Stack direction="row" justify="space-between" gap={3}>
        <Stack gap={1}>
          <Text size="lg" weight={600}>
            {formatMoney(report.totals.grossMinor, report.currency)}
          </Text>
          <Text size="sm" muted>
            Валовая выручка · {report.totals.bookings} брон.
          </Text>
        </Stack>
        <Stack gap={1}>
          <Text size="lg" weight={600}>
            {formatMoney(report.totals.commissionMinor, report.currency)}
          </Text>
          <Text size="sm" muted>
            Комиссии площадок
          </Text>
        </Stack>
        <Stack gap={1}>
          <Text size="lg" weight={600}>
            {formatMoney(report.totals.netMinor, report.currency)}
          </Text>
          <Text size="sm" muted>
            Чистыми
          </Text>
        </Stack>
      </Stack>
    </Card>

    {report.rows.length === 0 ? (
      <Text muted>Нет броней за период</Text>
    ) : (
      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {report.rows.map((row) => (
          <Row key={row.source} row={row} currency={report.currency} />
        ))}
      </Stack>
    )}
  </>
);

/** Отчёт по комиссиям за период. Виджет владеет своим состоянием и данными. */
export const CommissionReport = () => {
  const initial = monthRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const report = useCommissionReport(from, to);

  return (
    <Stack gap={4}>
      <Card>
        <Stack direction="row" gap={3} align="flex-end">
          <Stack gap={1}>
            <Text size="sm" muted>
              С даты (по заезду)
            </Text>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Stack>
          <Stack gap={1}>
            <Text size="sm" muted>
              По дату
            </Text>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Stack>
        </Stack>
      </Card>

      {from >= to && <Text css={(t) => ({ color: t.colors.danger })}>Конец периода должен быть позже начала</Text>}
      {report.isLoading && <Text>Загрузка…</Text>}
      {report.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}
      {report.data && <Body report={report.data} />}
    </Stack>
  );
};
