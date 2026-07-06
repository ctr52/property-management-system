import { useState, type FormEvent, type ReactNode } from 'react';
import { useCan } from '../../entities/auth';
import {
  PRICE_FACTS,
  usePropertyPricing,
  type FactKey,
  type FactType,
  type PriceAdjustment,
  type PriceCondition,
  type PriceOperator,
  type PricePredicate,
} from '../../entities/pricing';
import {
  useCreateRule,
  useRemoveOverride,
  useRemoveRule,
  useSetOverride,
} from '../../features/manage-pricing/usePricing';
import { Button, Card, Input, Select, Stack, Text } from '../../shared/ui';

const rub = (minor: number) => (minor / 100).toLocaleString('ru-RU');

const OPS: { value: PriceOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'in', label: 'из списка' },
  { value: 'between', label: 'между' },
];
const OP_LABEL: Record<PriceOperator, string> = Object.fromEntries(OPS.map((o) => [o.value, o.label])) as Record<
  PriceOperator,
  string
>;

const factMeta = (key: string) =>
  PRICE_FACTS.find((f) => f.key === key) ?? ({ key, label: key, type: 'number' as FactType });
const factLabel = (key: string) => factMeta(key).label;

// ---- Описание предиката для списка ----
const describeValue = (v: PriceCondition['value']): string => (Array.isArray(v) ? v.join(' … ') : String(v));
const describeCond = (c: PriceCondition): string => `${factLabel(c.fact)} ${OP_LABEL[c.op]} ${describeValue(c.value)}`;
const describePredicate = (p: PricePredicate): string => {
  switch (p.kind) {
    case 'cond':
      return describeCond(p);
    case 'all':
      return p.nodes.map(describePredicate).join(' и ');
    case 'any':
      return p.nodes.map(describePredicate).join(' или ');
    case 'not':
      return `не (${describePredicate(p.node)})`;
  }
};

const describeAdjustment = (a: PriceAdjustment): string => {
  switch (a.type) {
    case 'percent':
      return `${a.value > 0 ? '+' : ''}${a.value}%`;
    case 'delta':
      return `${a.amountMinor > 0 ? '+' : ''}${rub(a.amountMinor)} ₽`;
    case 'absolute':
      return `= ${rub(a.amountMinor)} ₽`;
  }
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Stack gap={1} css={{ flex: 1 }}>
    <Text size="sm" muted>
      {label}
    </Text>
    {children}
  </Stack>
);

// ---- Конструктор условий ----
type CondDraft = { id: string; fact: FactKey; op: PriceOperator; value: string; value2: string };

const newCond = (over: Partial<CondDraft> = {}): CondDraft => ({
  id: crypto.randomUUID(),
  fact: 'is_weekend',
  op: 'eq',
  value: 'true',
  value2: '',
  ...over,
});

const coerceScalar = (type: FactType, s: string): string | number | boolean =>
  type === 'number' ? Number(s) : type === 'boolean' ? s === 'true' : s;

const toCondition = (c: CondDraft): PriceCondition => {
  const type = factMeta(c.fact).type;
  if (c.op === 'between') {
    return { kind: 'cond', fact: c.fact, op: 'between', value: [Number(c.value), Number(c.value2)] };
  }
  if (c.op === 'in') {
    const parts = c.value.split(',').map((x) => x.trim()).filter(Boolean);
    return { kind: 'cond', fact: c.fact, op: 'in', value: type === 'number' ? parts.map(Number) : parts };
  }
  return { kind: 'cond', fact: c.fact, op: c.op, value: coerceScalar(type, c.value) };
};

const ValueInput = ({ cond, onChange }: { cond: CondDraft; onChange: (patch: Partial<CondDraft>) => void }) => {
  const type = factMeta(cond.fact).type;
  if (cond.op === 'between') {
    return (
      <Stack direction="row" gap={1}>
        <Input type="number" placeholder="от" value={cond.value} onChange={(e) => onChange({ value: e.target.value })} required />
        <Input type="number" placeholder="до" value={cond.value2} onChange={(e) => onChange({ value2: e.target.value })} required />
      </Stack>
    );
  }
  if (cond.op === 'in') {
    return <Input placeholder="через запятую (напр. 5,6)" value={cond.value} onChange={(e) => onChange({ value: e.target.value })} required />;
  }
  if (type === 'boolean') {
    return (
      <Select value={cond.value} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="true">да</option>
        <option value="false">нет</option>
      </Select>
    );
  }
  if (type === 'platform') {
    return (
      <Select value={cond.value} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="avito">Avito</option>
        <option value="cian">Cian</option>
      </Select>
    );
  }
  return <Input type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'} value={cond.value} onChange={(e) => onChange({ value: e.target.value })} required />;
};

const PRESETS: { label: string; combinator: 'all' | 'any'; conds: CondDraft[] }[] = [
  { label: 'Выходные', combinator: 'all', conds: [newCond({ fact: 'is_weekend', op: 'eq', value: 'true' })] },
  {
    label: 'Сезон',
    combinator: 'all',
    conds: [newCond({ fact: 'date', op: 'gte', value: '' }), newCond({ fact: 'date', op: 'lt', value: '' })],
  },
  { label: 'Наценка Avito', combinator: 'all', conds: [newCond({ fact: 'platform', op: 'eq', value: 'avito' })] },
  { label: 'LOS ≥ 7', combinator: 'all', conds: [newCond({ fact: 'length_of_stay', op: 'gte', value: '7' })] },
  { label: 'Last-minute ≤3д', combinator: 'all', conds: [newCond({ fact: 'lead_time_days', op: 'lte', value: '3' })] },
];

type AdjType = PriceAdjustment['type'];

const RuleForm = ({ propertyId }: { propertyId: string }) => {
  const create = useCreateRule(propertyId);
  const [label, setLabel] = useState('');
  const [combinator, setCombinator] = useState<'all' | 'any'>('all');
  const [conds, setConds] = useState<CondDraft[]>([newCond()]);
  const [adjType, setAdjType] = useState<AdjType>('percent');
  const [adjValue, setAdjValue] = useState('');

  const patchCond = (id: string, patch: Partial<CondDraft>) =>
    setConds((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const buildAdjustment = (): PriceAdjustment => {
    if (adjType === 'percent') return { type: 'percent', value: Number(adjValue || 0) };
    const amountMinor = Math.round(Number(adjValue || 0) * 100);
    return adjType === 'delta' ? { type: 'delta', amountMinor } : { type: 'absolute', amountMinor };
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setCombinator(preset.combinator);
    setConds(preset.conds.map((c) => newCond(c)));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const match: PricePredicate = { kind: combinator, nodes: conds.map(toCondition) };
    create.mutate(
      { propertyId, label, match, adjustment: buildAdjustment() },
      {
        onSuccess: () => {
          setLabel('');
          setAdjValue('');
          setConds([newCond()]);
          setCombinator('all');
        },
      },
    );
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <Stack gap={2}>
          <Text weight={600}>Новое правило</Text>
          <Input placeholder="Название (напр. «Высокий сезон»)" value={label} onChange={(e) => setLabel(e.target.value)} required />

          <Stack direction="row" gap={1} css={{ flexWrap: 'wrap' }}>
            <Text size="sm" muted>
              Пресеты:
            </Text>
            {PRESETS.map((p) => (
              <Button key={p.label} type="button" variant="secondary" onClick={() => applyPreset(p)}>
                {p.label}
              </Button>
            ))}
          </Stack>

          <Stack direction="row" gap={2} align="center">
            <Text size="sm" muted>
              Срабатывает, если
            </Text>
            <Select value={combinator} onChange={(e) => setCombinator(e.target.value as 'all' | 'any')}>
              <option value="all">все условия (И)</option>
              <option value="any">любое условие (ИЛИ)</option>
            </Select>
          </Stack>

          <Stack gap={2}>
            {conds.map((c) => (
              <Stack key={c.id} direction="row" gap={1} align="flex-end">
                <Field label="Факт">
                  <Select value={c.fact} onChange={(e) => patchCond(c.id, { fact: e.target.value as FactKey })}>
                    {PRICE_FACTS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Оператор">
                  <Select value={c.op} onChange={(e) => patchCond(c.id, { op: e.target.value as PriceOperator })}>
                    {OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Значение">
                  <ValueInput cond={c} onChange={(patch) => patchCond(c.id, patch)} />
                </Field>
                {conds.length > 1 && (
                  <Button type="button" variant="secondary" onClick={() => setConds((cs) => cs.filter((x) => x.id !== c.id))}>
                    ✕
                  </Button>
                )}
              </Stack>
            ))}
            <Stack direction="row">
              <Button type="button" variant="secondary" onClick={() => setConds((cs) => [...cs, newCond()])}>
                + условие
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" gap={2} align="flex-end">
            <Field label="Как меняем">
              <Select value={adjType} onChange={(e) => setAdjType(e.target.value as AdjType)}>
                <option value="percent">Процент %</option>
                <option value="delta">± Рубли</option>
                <option value="absolute">Фикс. цена ₽</option>
              </Select>
            </Field>
            <Field label={adjType === 'percent' ? 'Значение, %' : 'Значение, ₽'}>
              <Input type="number" value={adjValue} onChange={(e) => setAdjValue(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Сохраняем…' : 'Добавить'}
            </Button>
          </Stack>
          {create.isError && <Text css={(t) => ({ color: t.colors.danger })}>{create.error.message}</Text>}
        </Stack>
      </form>
    </Card>
  );
};

const OverrideForm = ({ propertyId }: { propertyId: string }) => {
  const setOverride = useSetOverride(propertyId);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setOverride.mutate(
      { propertyId, date, amountMinor: Math.round(Number(amount || 0) * 100) },
      {
        onSuccess: () => {
          setDate('');
          setAmount('');
        },
      },
    );
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <Stack direction="row" gap={2} align="flex-end">
          <Field label="Дата">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Цена за ночь, ₽">
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={setOverride.isPending}>
            Задать
          </Button>
        </Stack>
      </form>
    </Card>
  );
};

/** Управление ценами объекта: правила (generic-условия) + ручные цены по датам. */
export const PricingPanel = ({ propertyId }: { propertyId: string }) => {
  const canWrite = useCan()('property:write');
  const pricing = usePropertyPricing(propertyId);
  const removeRule = useRemoveRule(propertyId);
  const removeOverride = useRemoveOverride(propertyId);

  return (
    <Stack gap={3}>
      {canWrite && <RuleForm propertyId={propertyId} />}

      {pricing.isLoading && <Text>Загрузка…</Text>}
      {pricing.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}

      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {pricing.data?.rules.map((r) => (
          <Card as="li" key={r.id}>
            <Stack direction="row" justify="space-between" align="center">
              <Stack gap={1}>
                <Text weight={600}>
                  {r.label} {!r.enabled && '· выкл.'}
                </Text>
                <Text size="sm" muted>
                  {describePredicate(r.match)} → {describeAdjustment(r.adjustment)}
                </Text>
              </Stack>
              {canWrite && (
                <Button variant="secondary" disabled={removeRule.isPending} onClick={() => removeRule.mutate(r.id)}>
                  Удалить
                </Button>
              )}
            </Stack>
          </Card>
        ))}
        {pricing.data && pricing.data.rules.length === 0 && <Text muted>Правил нет — действует базовая цена.</Text>}
      </Stack>

      <Text weight={600}>Ручные цены по датам</Text>
      {canWrite && <OverrideForm propertyId={propertyId} />}
      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {pricing.data?.overrides.map((o) => (
          <Card as="li" key={o.date}>
            <Stack direction="row" justify="space-between" align="center">
              <Text>
                {o.date} · <b>{rub(o.amountMinor)} ₽</b>
              </Text>
              {canWrite && (
                <Button
                  variant="secondary"
                  disabled={removeOverride.isPending}
                  onClick={() => removeOverride.mutate({ propertyId, date: o.date })}
                >
                  Убрать
                </Button>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};
