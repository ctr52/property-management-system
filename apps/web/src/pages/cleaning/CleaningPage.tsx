import { useCan } from '../../entities/auth';
import { CleaningBoard } from '../../widgets/cleaning-board/CleaningBoard';
import { MyCleaning } from '../../widgets/my-cleaning/MyCleaning';
import { Heading, Stack } from '../../shared/ui';

/** Менеджер видит доску всех уборок; клинер — только свои задачи. */
export const CleaningPage = () => {
  const can = useCan();
  return (
    <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Heading>Уборка</Heading>
      {can('cleaning:read') ? <CleaningBoard /> : <MyCleaning />}
    </Stack>
  );
};
