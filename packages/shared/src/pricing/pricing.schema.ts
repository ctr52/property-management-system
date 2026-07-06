import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

/** Как правило меняет цену: процент / фикс-дельта / абсолютная установка. Деньги — minor units. */
export const PriceAdjustmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), value: z.number().min(-100).max(1000) }),
  z.object({ type: z.literal('delta'), amountMinor: z.number().int() }),
  z.object({ type: z.literal('absolute'), amountMinor: z.number().int().nonnegative() }),
]);
export type PriceAdjustment = z.infer<typeof PriceAdjustmentSchema>;

/**
 * Generic-DSL условий (вариант B): правило срабатывает, когда его предикат истинен на наборе
 * «фактов» даты/брони. Движок — обобщённый интерпретатор: новые условия задаются ДАННЫМИ
 * (комбинация факт+оператор+значение), без логики per-rule в коде. Новый факт = 1 строка
 * в сборщике фактов.
 */
export const PriceOperatorSchema = z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'between']);
export type PriceOperator = z.infer<typeof PriceOperatorSchema>;

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);
/** Значение условия: примитив, либо массив (для `in`/`between`). */
export const PriceConditionValueSchema = z.union([
  PrimitiveSchema,
  z.array(z.union([z.string(), z.number()])),
]);
export type PriceConditionValue = z.infer<typeof PriceConditionValueSchema>;

/**
 * Известные факты — словарь для UI и подсказок (движок принимает любой `fact`-ключ;
 * неизвестный факт → условие ложно). Добавить факт = одна строка тут + одна в сборщике фактов.
 *  - type управляет вводом значения в конструкторе.
 */
export const PRICE_FACTS = [
  { key: 'is_weekend', label: 'Выходной день (Сб/Вс)', type: 'boolean' },
  { key: 'dow', label: 'День недели (0=Вс … 6=Сб)', type: 'number' },
  { key: 'date', label: 'Дата', type: 'date' },
  { key: 'month', label: 'Месяц (1–12)', type: 'number' },
  { key: 'day', label: 'Число месяца (1–31)', type: 'number' },
  { key: 'year', label: 'Год', type: 'number' },
  { key: 'platform', label: 'Площадка', type: 'platform' },
  { key: 'length_of_stay', label: 'Ночей в брони', type: 'number' },
  { key: 'lead_time_days', label: 'Дней до заезда', type: 'number' },
] as const;
export type FactKey = (typeof PRICE_FACTS)[number]['key'];
export type FactType = (typeof PRICE_FACTS)[number]['type'];

/** Лист предиката — одно условие. */
export const PriceConditionSchema = z.object({
  kind: z.literal('cond'),
  fact: z.string().min(1),
  op: PriceOperatorSchema,
  value: PriceConditionValueSchema,
});
export type PriceCondition = z.infer<typeof PriceConditionSchema>;

/** Рекурсивный предикат: условие или булева комбинация (all/any/not). */
export type PricePredicate =
  | PriceCondition
  | { readonly kind: 'all'; readonly nodes: readonly PricePredicate[] }
  | { readonly kind: 'any'; readonly nodes: readonly PricePredicate[] }
  | { readonly kind: 'not'; readonly node: PricePredicate };

export const PricePredicateSchema: z.ZodType<PricePredicate> = z.lazy(() =>
  z.union([
    PriceConditionSchema,
    z.object({ kind: z.literal('all'), nodes: z.array(PricePredicateSchema) }),
    z.object({ kind: z.literal('any'), nodes: z.array(PricePredicateSchema) }),
    z.object({ kind: z.literal('not'), node: PricePredicateSchema }),
  ]),
);

/** Предикат должен содержать хотя бы одно условие (пустой = «всегда», бессмысленно). */
const hasCondition = (p: PricePredicate): boolean =>
  p.kind === 'cond' ? true : p.kind === 'not' ? hasCondition(p.node) : p.nodes.some(hasCondition);

export const PriceRuleViewSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  label: z.string(),
  priority: z.number().int(),
  enabled: z.boolean(),
  match: PricePredicateSchema,
  adjustment: PriceAdjustmentSchema,
});
export type PriceRuleView = z.infer<typeof PriceRuleViewSchema>;

export const CreatePriceRuleInputSchema = z
  .object({
    propertyId: z.string().uuid(),
    label: z.string().min(1).max(120),
    priority: z.number().int().default(0),
    enabled: z.boolean().default(true),
    match: PricePredicateSchema,
    adjustment: PriceAdjustmentSchema,
  })
  .refine((v) => hasCondition(v.match), { message: 'Условие должно содержать хотя бы один критерий' });
export type CreatePriceRuleInput = z.infer<typeof CreatePriceRuleInputSchema>;
/** То, что ШЛЁТ клиент: поля с `.default()` опциональны. */
export type CreatePriceRuleRequest = z.input<typeof CreatePriceRuleInputSchema>;

/** Ручная цена на конкретную дату — перебивает правила (но не channel-markup). */
export const PriceOverrideViewSchema = z.object({
  propertyId: z.string().uuid(),
  date: dateString,
  amountMinor: z.number().int().nonnegative(),
});
export type PriceOverrideView = z.infer<typeof PriceOverrideViewSchema>;

export const SetPriceOverrideInputSchema = z.object({
  propertyId: z.string().uuid(),
  date: dateString,
  amountMinor: z.number().int().nonnegative(),
});
export type SetPriceOverrideInput = z.infer<typeof SetPriceOverrideInputSchema>;

export const RemovePriceOverrideInputSchema = z.object({
  propertyId: z.string().uuid(),
  date: dateString,
});
export type RemovePriceOverrideInput = z.infer<typeof RemovePriceOverrideInputSchema>;

/** Прайсинг объекта целиком: правила + ручные оверрайды. */
export const PropertyPricingSchema = z.object({
  rules: z.array(PriceRuleViewSchema),
  overrides: z.array(PriceOverrideViewSchema),
});
export type PropertyPricing = z.infer<typeof PropertyPricingSchema>;

/** Расчёт цены проживания (quote): цена по DSL за каждую ночь + итого. */
export const StayQuoteNightSchema = z.object({ date: dateString, amountMinor: z.number().int() });
export type StayQuoteNight = z.infer<typeof StayQuoteNightSchema>;

export const StayQuoteSchema = z.object({
  checkIn: dateString,
  checkOut: dateString,
  nights: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  currency: z.string(),
  perNight: z.array(StayQuoteNightSchema),
});
export type StayQuote = z.infer<typeof StayQuoteSchema>;

export const StayQuoteQuerySchema = z
  .object({
    propertyId: z.string().uuid(),
    checkIn: dateString,
    checkOut: dateString,
  })
  .refine((v) => v.checkIn < v.checkOut, { message: 'Выезд должен быть позже заезда' });
export type StayQuoteQuery = z.infer<typeof StayQuoteQuerySchema>;
