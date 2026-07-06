import { useCan } from '../../entities/auth';
import { CommissionRates } from '../../widgets/commission-rates/CommissionRates';
import { CommissionReport } from '../../widgets/commission-report/CommissionReport';
import { Heading, Stack } from '../../shared/ui';

/** Комиссии: настройка ставок per-channel (для тех, кто может) + отчёт по комиссиям. */
export const CommissionsPage = () => {
  const can = useCan();
  return (
    <Stack as="main" gap={5} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Heading>Комиссии</Heading>
      {can('commission:manage') && <CommissionRates />}
      <CommissionReport />
    </Stack>
  );
};
