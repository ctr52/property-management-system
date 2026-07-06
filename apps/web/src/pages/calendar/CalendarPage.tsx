import { useState } from 'react';
import { Button, Heading, Stack, Text } from '../../shared/ui';
import { CalendarGrid } from '../../widgets/calendar-grid/CalendarGrid';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 14;

const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const startOfTodayUtc = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

export const CalendarPage = () => {
  const [startMs, setStartMs] = useState(startOfTodayUtc);

  const from = toIso(startMs);
  const to = toIso(startMs + (WINDOW_DAYS - 1) * DAY_MS);
  const shift = (deltaDays: number) => setStartMs((ms) => ms + deltaDays * DAY_MS);

  return (
    <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <Heading>Календарь</Heading>
      <Stack direction="row" gap={2} align="center">
        <Button variant="secondary" onClick={() => shift(-WINDOW_DAYS)}>
          ← Раньше
        </Button>
        <Text muted>
          {from} — {to}
        </Text>
        <Button variant="secondary" onClick={() => shift(WINDOW_DAYS)}>
          Позже →
        </Button>
        <Button variant="secondary" onClick={() => setStartMs(startOfTodayUtc())}>
          Сегодня
        </Button>
      </Stack>
      <CalendarGrid from={from} to={to} />
    </Stack>
  );
};
