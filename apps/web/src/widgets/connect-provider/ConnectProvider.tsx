import { useState, type FormEvent } from 'react';
import type { ConnectFieldSpec, ProviderManifest } from '@pms/shared';
import { usePaymentProviders } from '../../entities/payment';
import { useConnectProvider } from '../../features/manage-payments/usePayments';
import { Button, Heading, Input, Select, Stack, Text, Textarea } from '../../shared/ui';

const initialValues = (schema: readonly ConnectFieldSpec[]): Record<string, string> =>
  Object.fromEntries(schema.map((f) => [f.key, f.kind === 'select' ? f.options?.[0] ?? '' : '']));

/** Форма подключения — целиком из manifest.connectSchema. Никакого хардкода под провайдера. */
const ProviderForm = ({ manifest, onDone }: { manifest: ProviderManifest; onDone?: () => void }) => {
  const connect = useConnectProvider();
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(manifest.connectSchema));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const basicFields = manifest.connectSchema.filter((f) => !f.advanced);
  const advancedFields = manifest.connectSchema.filter((f) => f.advanced);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    connect.mutate({ provider: manifest.id, credentials: values }, { onSuccess: () => onDone?.() });
  };

  const renderField = (field: ConnectFieldSpec) => (
    <Stack key={field.key} gap={1}>
      <Text size="sm" muted>
        {field.label}
        {field.required ? ' *' : ''}
      </Text>
      {field.kind === 'select' ? (
        <Select
          value={values[field.key] ?? ''}
          onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      ) : field.kind === 'textarea' ? (
        <Textarea
          value={values[field.key] ?? ''}
          placeholder={field.hint}
          onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
        />
      ) : (
        <Input
          type={field.secret ? 'password' : field.kind === 'url' ? 'url' : 'text'}
          value={values[field.key] ?? ''}
          required={field.required}
          placeholder={field.hint ? `по умолчанию: ${field.hint}` : undefined}
          onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
        />
      )}
    </Stack>
  );

  return (
    <form onSubmit={submit}>
      <Stack gap={3}>
        <Heading>{manifest.title}</Heading>
        {manifest.capabilities.ingest === 'push' && (
          <Text size="sm" muted>
            После подключения появится URL вебхука — вставьте его в настройки вашей платёжной системы
            (куда она шлёт уведомление об оплате).
          </Text>
        )}
        {basicFields.map(renderField)}
        {manifest.connectSchema.length === 0 && <Text muted>Подключение без реквизитов.</Text>}
        {advancedFields.length > 0 && (
          <Stack gap={2}>
            <Button type="button" variant="secondary" onClick={() => setShowAdvanced((s) => !s)}>
              {showAdvanced ? 'Скрыть шаблоны маппинга' : 'Свой маппинг под вашу ПС (JSONata) ▾'}
            </Button>
            {showAdvanced && advancedFields.map(renderField)}
          </Stack>
        )}
        <Stack direction="row" gap={2}>
          <Button type="submit" disabled={connect.isPending}>
            {connect.isPending ? 'Подключаем…' : 'Подключить'}
          </Button>
          {onDone && (
            <Button type="button" variant="secondary" onClick={onDone}>
              Отмена
            </Button>
          )}
        </Stack>
        {connect.isError && <Text css={(t) => ({ color: t.colors.danger })}>{connect.error.message}</Text>}
      </Stack>
    </form>
  );
};

/**
 * Подключение платёжного провайдера по id. Один и тот же компонент — и на странице, и в модалке.
 * Манифест берём из списка провайдеров (источник правды — сервер), форму строим по нему.
 */
export const ConnectProvider = ({ providerId, onDone }: { providerId: string; onDone?: () => void }) => {
  const providers = usePaymentProviders();
  const manifest = providers.data?.find((m) => m.id === providerId);

  return (
    <Stack css={{ padding: 24 }}>
      {providers.isLoading && <Text>Загрузка…</Text>}
      {providers.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}
      {providers.data && !manifest && <Text css={(t) => ({ color: t.colors.danger })}>Провайдер не найден</Text>}
      {manifest && <ProviderForm manifest={manifest} onDone={onDone} />}
    </Stack>
  );
};
