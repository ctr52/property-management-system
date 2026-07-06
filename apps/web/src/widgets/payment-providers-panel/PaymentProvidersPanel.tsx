import type { ReactNode } from 'react';
import type { PaymentCapabilities } from '@pms/shared';
import { useCan } from '../../entities/auth';
import { usePaymentAccounts, usePaymentProviders } from '../../entities/payment';
import { useDisconnectProvider } from '../../features/manage-payments/usePayments';
import { Button, Card, LinkButton, Stack, Text } from '../../shared/ui';

const Chip = ({ children }: { children: ReactNode }) => (
  <Text
    size="sm"
    css={(t) => ({
      background: t.colors.surface,
      border: `1px solid ${t.colors.border}`,
      borderRadius: t.radii.sm,
      padding: `2px ${t.space(2)}`,
    })}
  >
    {children}
  </Text>
);

const capabilityChips = (c: PaymentCapabilities): string[] => {
  const chips = [`приём: ${c.ingest}`];
  if (c.refunds) chips.push('возвраты');
  if (c.recurring) chips.push('рекуррент');
  if (c.receipts) chips.push('54-ФЗ');
  return chips;
};

/** URL вебхука (ResultURL) push-провайдера — копируется в настройки внешней платёжной системы. */
const WebhookBox = ({ provider, url }: { provider: string; url: string }) => (
  <Stack
    gap={1}
    css={(t) => ({
      background: t.colors.surface,
      border: `1px solid ${t.colors.border}`,
      borderRadius: t.radii.md,
      padding: t.space(2),
    })}
  >
    <Text size="sm" muted>
      URL для уведомлений об оплате — вставьте его в настройки вашей платёжной системы (ResultURL / webhook):
    </Text>
    <Stack direction="row" gap={1} align="center" css={{ flexWrap: 'wrap' }}>
      <Text size="sm" css={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {url}
      </Text>
      <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(url)}>
        Копировать
      </Button>
    </Stack>
    {provider === 'generic-hosted-link' && (
      <Text size="sm" muted>
        По умолчанию ждём POST: JSON{' '}
        {'{ order, externalId, status: "success" | "fail" | "refund", amount }'} с заголовком{' '}
        <code>x-signature</code> = HMAC-SHA256(тело, ключ). Если у вашей ПС другой формат/подпись —
        задайте свой шаблон JSONata при подключении. Возврат гостя (returnUrl) передаётся в каждом
        платеже автоматически.
      </Text>
    )}
  </Stack>
);

/**
 * Управление платёжными провайдерами: список аккаунтов + подключение. Подключение — отдельный
 * модальный роут (/payments/connect/:provider) через <LinkButton/>: левый клик — модалка, новая
 * вкладка — отдельная страница.
 */
export const PaymentProvidersPanel = () => {
  const canManage = useCan()('payment:manage');
  const providers = usePaymentProviders();
  const accounts = usePaymentAccounts();
  const disconnect = useDisconnectProvider();

  const activeAccountFor = (providerId: string) =>
    (accounts.data ?? []).find((a) => a.provider === providerId && a.status === 'active');

  return (
    <Stack gap={3}>
      {providers.isLoading && <Text>Загрузка…</Text>}
      {providers.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}

      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {providers.data?.map((manifest) => {
          const account = activeAccountFor(manifest.id);
          return (
            <Card as="li" key={manifest.id}>
              <Stack gap={2}>
                <Stack direction="row" justify="space-between" align="center">
                  <Stack gap={1}>
                    <Text weight={600}>
                      {manifest.title} {account && '· подключён'}
                    </Text>
                    <Stack direction="row" gap={1} css={{ flexWrap: 'wrap' }}>
                      <Chip>{manifest.kind}</Chip>
                      {capabilityChips(manifest.capabilities).map((ch) => (
                        <Chip key={ch}>{ch}</Chip>
                      ))}
                    </Stack>
                  </Stack>
                  {canManage &&
                    (account ? (
                      <Button
                        variant="secondary"
                        disabled={disconnect.isPending}
                        onClick={() => disconnect.mutate(account.id)}
                      >
                        Отключить
                      </Button>
                    ) : (
                      <LinkButton to="/payments" modal={`/payments/connect/${manifest.id}`}>
                        Подключить
                      </LinkButton>
                    ))}
                </Stack>
                {account?.webhookUrl && <WebhookBox provider={manifest.id} url={account.webhookUrl} />}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
};
