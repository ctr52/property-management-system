import { ReportsSummary } from '../../widgets/reports-summary/ReportsSummary';
import { Heading, Stack } from '../../shared/ui';

/** Отчёты: загрузка и выручка по объектам за период. */
export const ReportsPage = () => (
  <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
    <Heading>Отчёты</Heading>
    <ReportsSummary />
  </Stack>
);
