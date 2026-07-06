import { useState, type FormEvent } from 'react';
import { useCreateProperty } from '../../features/create-property/useCreateProperty';
import { Button, Heading, Input, Stack, Text } from '../../shared/ui';

/**
 * Создание объекта. Один и тот же компонент рендерится и на странице, и в модалке.
 * `onDone` вызывается после успешного создания и по «Отмене» (закрыть/вернуться).
 */
export const CreateProperty = ({ onDone }: { onDone?: () => void }) => {
  const create = useCreateProperty();
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { title, address, basePriceMinor: Math.round(Number(price) * 100), currency: 'RUB' },
      { onSuccess: () => onDone?.() },
    );
  };

  return (
    <Stack css={{ padding: 24 }}>
      <form onSubmit={submit}>
        <Stack gap={3}>
          <Heading>Новый объект</Heading>
          <Stack gap={2}>
            <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <Input placeholder="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} required />
            <Input
              placeholder="Цена за ночь, ₽"
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </Stack>
          <Stack direction="row" gap={2}>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Сохраняем…' : 'Добавить объект'}
            </Button>
            {onDone && (
              <Button type="button" variant="secondary" onClick={onDone}>
                Отмена
              </Button>
            )}
          </Stack>
          {create.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка при сохранении</Text>}
        </Stack>
      </form>
    </Stack>
  );
};
