import type { Property } from '../../entities/property';
import { Card, Link, Stack, Text } from '../../shared/ui';

const formatPrice = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(minor / 100);

/**
 * Карточка объекта. «Настройки» — наш <Link/>: левый клик откроет настройки
 * модалкой, а Ctrl/Cmd-клик / новая вкладка / прямой переход — отдельной страницей.
 */
export const PropertyCard = ({ property }: { property: Property }) => (
  <Card as="li">
    <Stack direction="row" justify="space-between" align="center">
      <Stack gap={1}>
        <Link to={`/properties/${property.id}`}>{property.title}</Link>
        <Text muted>{property.address}</Text>
        <Text weight={600}>{formatPrice(property.basePriceMinor, property.currency)}</Text>
      </Stack>
      <Link to="/properties" modal={`/properties/${property.id}/settings`}>
        Настройки
      </Link>
    </Stack>
  </Card>
);
