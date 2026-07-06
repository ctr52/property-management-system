import { useSubscription } from '../../entities/subscription';
import { Link, Stack, Text } from '../../shared/ui';

/**
 * Глобальный баннер режима «только чтение» (подписка expired/canceled). Самодостаточен — сам
 * читает подписку. Серверный гейт ([[read-only-gate]]) всё равно блокирует запись для всех ролей;
 * баннер — лишь UX-подсказка с переходом к оплате. Не отображается, пока подписка ок/грузится.
 */
export const ReadOnlyBanner = () => {
  const sub = useSubscription();
  if (!sub.data?.readOnly) return null;

  return (
    <Stack
      direction="row"
      gap={2}
      align="center"
      justify="space-between"
      css={(t) => ({
        padding: `${t.space(2)} ${t.space(6)}`,
        background: t.colors.dangerSurface,
        borderBottom: `1px solid ${t.colors.danger}`,
        flexWrap: 'wrap',
      })}
    >
      <Text size="sm" css={(t) => ({ color: t.colors.danger })}>
        Подписка неактивна — изменения недоступны (режим только для чтения). Данные сохранены.
      </Text>
      <Link to="/billing">Оплатить</Link>
    </Stack>
  );
};
