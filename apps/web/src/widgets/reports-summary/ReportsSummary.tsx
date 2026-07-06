import styled from '@emotion/styled';
import { useState, type ReactNode } from 'react';
import type { PropertyReportRow, Report } from '../../entities/reports';
import { useReport } from '../../entities/reports';
import { Card, Input, Stack, Text } from '../../shared/ui';

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

/** Первый день текущего месяца и первый день следующего — дефолтный период. */
const monthRange = (): { from: string; to: string } => {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Stack gap={1}>
    <Text size="sm" muted>
      {label}
    </Text>
    {children}
  </Stack>
);

/** Полоска загрузки (occupancy) — токены темы, без хардкода цветов. */
const BarTrack = styled.div(({ theme }) => ({
  height: 8,
  borderRadius: theme.radii.sm,
  background: theme.colors.border,
  overflow: 'hidden',
}));
const BarFill = styled.div<{ pct: number }>(({ theme, pct }) => ({
  height: '100%',
  width: `${pct}%`,
  background: theme.colors.link,
}));
const OccupancyBar = ({ pct }: { pct: number }) => (
  <BarTrack>
    <BarFill pct={pct} />
  </BarTrack>
);

const Row = ({ row, currency }: { row: PropertyReportRow; currency: string }) => (
  <Card as="li">
    <Stack gap={2}>
      <Stack direction="row" justify="space-between" align="center" gap={2}>
        <Text weight={600}>{row.propertyName}</Text>
        <Text weight={600}>{formatMoney(row.revenueMinor, currency)}</Text>
      </Stack>
      <OccupancyBar pct={row.occupancyPct} />
      <Stack direction="row" justify="space-between">
        <Text size="sm" muted>
          Загрузка {row.occupancyPct}% · {row.bookedNights} из {row.availableNights} ноч.
        </Text>
        <Text size="sm" muted>
          Средняя цена ночи {formatMoney(row.adrMinor, currency)}
        </Text>
      </Stack>
    </Stack>
  </Card>
);

const ReportBody = ({ report }: { report: Report }) => (
  <>
    <Card css={(t) => ({ borderColor: t.colors.link })}>
      <Stack gap={2}>
        <Text weight={600}>Итого за период · {report.totals.properties} об.</Text>
        <Stack direction="row" justify="space-between" gap={3}>
          <Stack gap={1}>
            <Text size="lg" weight={600}>
              {formatMoney(report.totals.revenueMinor, report.currency)}
            </Text>
            <Text size="sm" muted>
              Выручка
            </Text>
          </Stack>
          <Stack gap={1}>
            <Text size="lg" weight={600}>
              {report.totals.occupancyPct}%
            </Text>
            <Text size="sm" muted>
              Загрузка ({report.totals.bookedNights}/{report.totals.availableNights} ноч.)
            </Text>
          </Stack>
          <Stack gap={1}>
            <Text size="lg" weight={600}>
              {formatMoney(report.totals.adrMinor, report.currency)}
            </Text>
            <Text size="sm" muted>
              Средняя цена ночи
            </Text>
          </Stack>
        </Stack>
      </Stack>
    </Card>

    {report.rows.length === 0 ? (
      <Text muted>Нет объектов</Text>
    ) : (
      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {report.rows.map((row) => (
          <Row key={row.propertyId} row={row} currency={report.currency} />
        ))}
      </Stack>
    )}
  </>
);

/** Отчёт по загрузке и выручке за выбранный период. Виджет владеет своим состоянием и данными. */
export const ReportsSummary = () => {
  const initial = monthRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const report = useReport(from, to);

  return (
    <Stack gap={4}>
      <Card>
        <Stack direction="row" gap={3} align="flex-end">
          <Field label="С даты">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="По дату (выезд исключительно)">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </Stack>
      </Card>

      {from >= to && <Text css={(t) => ({ color: t.colors.danger })}>Конец периода должен быть позже начала</Text>}
      {report.isLoading && <Text>Загрузка…</Text>}
      {report.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки отчёта</Text>}

      {report.data && <ReportBody report={report.data} />}
    </Stack>
  );
};
