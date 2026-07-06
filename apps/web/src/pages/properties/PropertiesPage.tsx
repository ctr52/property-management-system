import { Heading, Stack } from '../../shared/ui';
import { PropertyList } from '../../widgets/property-list/PropertyList';

/** Страница: компонует виджеты. Логики/данных у страницы нет. */
export const PropertiesPage = () => (
  <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
    <Heading>Объекты</Heading>
    <PropertyList />
  </Stack>
);
