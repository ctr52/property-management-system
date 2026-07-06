import styled from '@emotion/styled';
import type { CalendarCell, CalendarCellState } from '@pms/shared';
import { useCan } from '../../entities/auth';
import { useCalendar } from '../../entities/calendar/api';
import { useCreateBlock, useRemoveBlock } from '../../features/manage-availability/useBlockDates';
import { Link, Stack, Text } from '../../shared/ui';

const parseUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const nextDay = (iso: string) => new Date(parseUtc(iso).getTime() + 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
const isWeekend = (iso: string) => {
  const day = parseUtc(iso).getUTCDay();
  return day === 0 || day === 6;
};
const dow = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(parseUtc(iso));
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseUtc(iso));
const fullDate = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    parseUtc(iso),
  );

// Цвет полосы занятости (насыщеннее фона, чтобы читалось как «бар брони»).
const BAND: Record<Exclude<CalendarCellState, 'open'>, string> = {
  booked: '#fca5a5',
  pending: '#fdba74',
  blocked: '#cbd5e1',
  cleaning: '#fde68a',
};
const stateLabel: Record<CalendarCellState, string> = {
  open: 'свободно',
  booked: 'бронь',
  pending: 'придержано',
  blocked: 'заблокировано',
  cleaning: 'уборка',
};

const Scroll = styled.div(({ theme }) => ({
  overflowX: 'auto',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.md,
}));
const Table = styled.table({ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: '13px' });

const HeadCell = styled.th<{ weekend?: boolean; today?: boolean }>(({ theme, weekend, today }) => ({
  padding: '6px 8px',
  minWidth: 46,
  borderBottom: `1px solid ${theme.colors.border}`,
  borderRight: `1px solid ${theme.colors.border}`,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  background: today ? '#dbeafe' : weekend ? '#f3f4f6' : '#fafafa',
  fontWeight: today ? 700 : 500,
  position: 'sticky',
  top: 0,
  zIndex: 1,
}));
const Corner = styled.th(({ theme }) => ({
  position: 'sticky',
  left: 0,
  top: 0,
  zIndex: 3,
  background: '#fafafa',
  borderBottom: `1px solid ${theme.colors.border}`,
  borderRight: `1px solid ${theme.colors.border}`,
  padding: '6px 12px',
  textAlign: 'left',
  minWidth: 190,
}));
const RowLabel = styled.td(({ theme }) => ({
  position: 'sticky',
  left: 0,
  zIndex: 2,
  background: theme.colors.bg,
  borderBottom: `1px solid ${theme.colors.border}`,
  borderRight: `1px solid ${theme.colors.border}`,
  padding: '8px 12px',
  whiteSpace: 'nowrap',
}));

type CellProps = {
  state: CalendarCellState;
  weekend: boolean;
  past: boolean;
  today: boolean;
  mergeLeft: boolean;
  mergeRight: boolean;
  clickable: boolean;
};
const Cell = styled.td<CellProps>(({ theme, state, weekend, past, today, mergeLeft, mergeRight, clickable }) => {
  const band = state === 'open' ? null : BAND[state];
  return {
    position: 'relative',
    overflow: 'visible',
    height: 38,
    padding: 0,
    textAlign: 'center',
    borderBottom: `1px solid ${theme.colors.border}`,
    // внутри полосы вертикальную линию убираем, чтобы бронь читалась цельной
    borderRight: `1px solid ${mergeRight ? 'transparent' : theme.colors.border}`,
    background: band ?? (today ? '#eff6ff' : weekend ? '#fafafa' : '#fff'),
    borderTopLeftRadius: band && !mergeLeft ? 8 : 0,
    borderBottomLeftRadius: band && !mergeLeft ? 8 : 0,
    borderTopRightRadius: band && !mergeRight ? 8 : 0,
    borderBottomRightRadius: band && !mergeRight ? 8 : 0,
    opacity: past && state === 'open' ? 0.45 : 1,
    color: state === 'open' ? theme.colors.textMuted : '#1a1a1a',
    cursor: clickable ? 'pointer' : 'default',
    userSelect: 'none',
  };
});

// Подпись брони, «вытекающая» вправо поверх полосы (читается как имя на баре).
const BandLabel = styled.div({
  position: 'absolute',
  left: 8,
  top: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
  fontSize: 12,
  fontWeight: 600,
  pointerEvents: 'none',
  zIndex: 1,
});

const tooltipFor = (cell: CalendarCell): string => {
  if (cell.state === 'open') return `Свободно · ${fullDate(cell.date)} · цена за ночь`;
  const who = cell.label ?? stateLabel[cell.state];
  if (cell.isStart) return `${who}: заезд ${fullDate(cell.date)}`;
  if (cell.isEnd) return `${who}: последняя ночь, выезд ${fullDate(nextDay(cell.date))}`;
  return `${who}: ночь ${fullDate(cell.date)} (${stateLabel[cell.state]})`;
};

const Swatch = styled.span<{ color: string }>(({ color }) => ({
  display: 'inline-block',
  width: 12,
  height: 12,
  borderRadius: 3,
  background: color,
  marginRight: 6,
  verticalAlign: 'middle',
}));

/**
 * Календарь занятости: строки — объекты, столбцы — НОЧИ. Бронь рисуется полосой по ночам
 * (от дня заезда до ночи перед выездом); день выезда свободен для нового заезда.
 * Клик по свободной ночи (property:write) → блок; по блокировке → снять.
 */
export const CalendarGrid = ({ from, to }: { from: string; to: string }) => {
  const calendar = useCalendar(from, to);
  const canWrite = useCan()('property:write');
  const createBlock = useCreateBlock();
  const removeBlock = useRemoveBlock();
  const busy = createBlock.isPending || removeBlock.isPending;
  const today = todayIso();

  if (calendar.isLoading) return <Text>Загрузка…</Text>;
  if (calendar.isError) return <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>;
  if (!calendar.data) return null;

  const { dates, rows } = calendar.data;
  if (rows.length === 0) {
    return <Text muted>Нет объектов. Создайте их на странице «Объекты».</Text>;
  }

  return (
    <Stack gap={2}>
      <Scroll>
        <Table>
          <thead>
            <tr>
              <Corner>Объект</Corner>
              {dates.map((date) => (
                <HeadCell key={date} weekend={isWeekend(date)} today={date === today}>
                  <div style={{ color: '#6b7280' }}>{dow(date)}</div>
                  <div>{dayLabel(date)}</div>
                </HeadCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.propertyId}>
                <RowLabel>
                  <Stack gap={1}>
                    <Link to={`/properties/${row.propertyId}`}>{row.title}</Link>
                    <Text size="sm" muted>
                      заезд {row.checkInTime} · выезд {row.checkOutTime}
                    </Text>
                  </Stack>
                </RowLabel>
                {row.cells.map((cell, i) => {
                  const prev = row.cells[i - 1];
                  const next = row.cells[i + 1];
                  const occupied = cell.state !== 'open';
                  const mergeLeft = occupied && prev?.holdId === cell.holdId;
                  const mergeRight = occupied && next?.holdId === cell.holdId;
                  const canBlock = cell.state === 'open';
                  const canUnblock = cell.state === 'blocked' && cell.holdId !== null;
                  const clickable = canWrite && !busy && (canBlock || canUnblock);
                  return (
                    <Cell
                      key={cell.date}
                      state={cell.state}
                      weekend={isWeekend(cell.date)}
                      past={cell.date < today}
                      today={cell.date === today}
                      mergeLeft={mergeLeft}
                      mergeRight={mergeRight}
                      clickable={clickable}
                      title={tooltipFor(cell)}
                      onClick={() => {
                        if (!clickable) return;
                        if (canBlock) {
                          createBlock.mutate({ propertyId: row.propertyId, from: cell.date, to: nextDay(cell.date) });
                        } else if (cell.holdId) {
                          removeBlock.mutate(cell.holdId);
                        }
                      }}
                    >
                      {occupied
                        ? !mergeLeft && (
                            <BandLabel>
                              {cell.isStart && <span>▸</span>}
                              {cell.label ?? stateLabel[cell.state]}
                            </BandLabel>
                          )
                        : Math.round(cell.priceMinor / 100)}
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      </Scroll>

      <Stack direction="row" gap={3} css={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Text size="sm" muted>
          <Swatch color={BAND.booked} />бронь
        </Text>
        <Text size="sm" muted>
          <Swatch color={BAND.pending} />придержано
        </Text>
        <Text size="sm" muted>
          <Swatch color={BAND.blocked} />блокировка
        </Text>
        <Text size="sm" muted>
          <Swatch color={BAND.cleaning} />уборка
        </Text>
        <Text size="sm" muted>
          Ячейка = ночь · число на свободной = цена за ночь (₽) · полоса идёт от заезда до ночи перед выездом
          (день выезда свободен).
        </Text>
      </Stack>
    </Stack>
  );
};
