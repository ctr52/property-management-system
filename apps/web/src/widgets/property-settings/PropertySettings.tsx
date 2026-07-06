import { useState, type FormEvent, type ReactNode } from 'react';
import { useCan } from '../../entities/auth';
import { useProperty, type Property } from '../../entities/property';
import { useEditProperty } from '../../features/edit-property/useEditProperty';
import { Button, Heading, Input, Stack, Text } from '../../shared/ui';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Stack gap={1}>
    <Text size="sm" muted>
      {label}
    </Text>
    {children}
  </Stack>
);

const SettingsForm = ({
  property,
  canWrite,
  onSaved,
}: {
  property: Property;
  canWrite: boolean;
  onSaved?: () => void;
}) => {
  const edit = useEditProperty();
  const [title, setTitle] = useState(property.title);
  const [address, setAddress] = useState(property.address);
  const [price, setPrice] = useState(String(property.basePriceMinor / 100));
  const [checkIn, setCheckIn] = useState(property.checkInTime);
  const [checkOut, setCheckOut] = useState(property.checkOutTime);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    edit.mutate(
      {
        id: property.id,
        patch: {
          title,
          address,
          basePriceMinor: Math.round(Number(price) * 100),
          checkInTime: checkIn,
          checkOutTime: checkOut,
        },
      },
      { onSuccess: () => onSaved?.() },
    );
  };

  return (
    <form onSubmit={submit}>
      <Stack gap={3}>
        <Heading>Настройки объекта</Heading>
        <Stack gap={2}>
          <Field label="Название">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} required />
          </Field>
          <Field label="Адрес">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canWrite} required />
          </Field>
          <Field label="Цена за ночь, ₽">
            <Input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={!canWrite}
              required
            />
          </Field>
          <Stack direction="row" gap={2}>
            <Field label="Время заезда">
              <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} disabled={!canWrite} required />
            </Field>
            <Field label="Время выезда">
              <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} disabled={!canWrite} required />
            </Field>
          </Stack>
        </Stack>

        {canWrite ? (
          <Button type="submit" disabled={edit.isPending}>
            {edit.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        ) : (
          <Text size="sm" muted>
            Только просмотр — нет прав на редактирование.
          </Text>
        )}
        {edit.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка при сохранении</Text>}
      </Stack>
    </form>
  );
};

/** Настройки объекта. Один и тот же компонент рендерится и на странице, и в модалке. */
export const PropertySettings = ({ id, onSaved }: { id: string; onSaved?: () => void }) => {
  const canWrite = useCan()('property:write');
  const property = useProperty(id);

  return (
    <Stack css={{ padding: 24 }}>
      {property.isLoading && <Text>Загрузка…</Text>}
      {property.isError && <Text css={(t) => ({ color: t.colors.danger })}>Объект не найден</Text>}
      {property.data && <SettingsForm property={property.data} canWrite={canWrite} onSaved={onSaved} />}
    </Stack>
  );
};
