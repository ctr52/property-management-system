import { useCan } from '../../entities/auth';
import { useProperty } from '../../entities/property';
import { ListingsPanel } from '../../widgets/listings-panel/ListingsPanel';
import { ReservationsPanel } from '../../widgets/reservations-panel/ReservationsPanel';
import { PricingPanel } from '../../widgets/pricing-panel/PricingPanel';
import { Heading, Link, Stack, Text } from '../../shared/ui';

const formatPrice = (minor: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(minor / 100);

export const PropertyDetailPage = ({ id }: { id: string }) => {
  const canSeeListings = useCan()('listing:read');
  const property = useProperty(id);

  return (
    <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Link to="/properties">← К объектам</Link>

      {property.isLoading && <Text>Загрузка…</Text>}
      {property.isError && <Text css={(t) => ({ color: t.colors.danger })}>Объект не найден</Text>}

      {property.data && (
        <>
          <Stack direction="row" justify="space-between" align="flex-start">
            <Stack gap={1}>
              <Heading>{property.data.title}</Heading>
              <Text muted>{property.data.address}</Text>
              <Text weight={600}>{formatPrice(property.data.basePriceMinor, property.data.currency)}</Text>
              <Text size="sm" muted>
                Заезд {property.data.checkInTime} · Выезд {property.data.checkOutTime}
              </Text>
            </Stack>
            <Link to={`/properties/${id}`} modal={`/properties/${id}/settings`}>
              Настройки
            </Link>
          </Stack>

          <Text size="lg" weight={600}>
            Брони
          </Text>
          <ReservationsPanel propertyId={id} />

          <Text size="lg" weight={600}>
            Цены
          </Text>
          <PricingPanel propertyId={id} />

          {canSeeListings && (
            <>
              <Text size="lg" weight={600}>
                Объявления
              </Text>
              <ListingsPanel propertyId={id} />
            </>
          )}
        </>
      )}
    </Stack>
  );
};
