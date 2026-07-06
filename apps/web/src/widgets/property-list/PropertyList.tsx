import { useCan } from '../../entities/auth';
import { useProperties } from '../../entities/property';
import { LinkButton, Stack, Text } from '../../shared/ui';
import { PropertyCard } from './PropertyCard';

/**
 * Самодостаточный виджет: сам тянет данные (useProperties). Создание объекта — отдельный
 * модальный роут (/properties/new) через <LinkButton/>: левый клик — модалка, новая вкладка —
 * отдельная страница. Никаких пропов-данных извне.
 */
export const PropertyList = () => {
  const canWrite = useCan()('property:write');
  const properties = useProperties();

  return (
    <Stack gap={4}>
      {canWrite && (
        <Stack direction="row">
          <LinkButton to="/properties" modal="/properties/new">Добавить объект</LinkButton>
        </Stack>
      )}

      {properties.isLoading && <Text>Загрузка…</Text>}
      {properties.isError && (
        <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>
      )}

      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {properties.data?.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </Stack>
    </Stack>
  );
};
