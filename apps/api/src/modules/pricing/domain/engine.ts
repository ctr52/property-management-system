import type { Platform } from '@pms/shared';
import type { PriceAdjustment, PriceCondition, PricePredicate, PriceRule } from './types';

/** Значение факта. Факты — это «срез» контекста даты/брони, над которым считается предикат. */
export type FactValue = string | number | boolean;
export type FactSet = Readonly<Record<string, FactValue>>;

export type EvalContext = {
  readonly date: string;
  /** Если задана — считаем цену ДЛЯ площадки (добавляет факт platform). undefined = «наша» цена. */
  readonly platform?: Platform;
  /** Контекст брони (известен на этапе котировки, не при per-date пуше) — факты отсутствуют иначе. */
  readonly lengthOfStay?: number;
  readonly leadTimeDays?: number;
};

/**
 * Сборщик фактов. ЕДИНСТВЕННОЕ место, где факт связывается с кодом. Добавить факт = одна строка.
 * Факты брони (length_of_stay/lead_time_days) добавляются только когда известны → условия на них
 * в per-date контексте просто ложны (правило не влияет на календарь, но сработает в котировке).
 */
export const buildFacts = (ctx: EvalContext): FactSet => {
  const d = new Date(`${ctx.date}T00:00:00Z`);
  const dow = d.getUTCDay();
  const facts: Record<string, FactValue> = {
    date: ctx.date,
    dow,
    day: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear(),
    is_weekend: dow === 0 || dow === 6,
  };
  if (ctx.platform !== undefined) facts.platform = ctx.platform;
  if (ctx.lengthOfStay !== undefined) facts.length_of_stay = ctx.lengthOfStay;
  if (ctx.leadTimeDays !== undefined) facts.lead_time_days = ctx.leadTimeDays;
  return facts;
};

/** Численное значение, если возможно (для сравнений чисел/строк-чисел); иначе null. */
const asNumber = (x: FactValue): number | null => {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x))) return Number(x);
  return null;
};

/** Сравнение: числа — численно, иначе лексикографически (даты 'YYYY-MM-DD' сравниваются корректно). */
const compare = (a: FactValue, b: FactValue): number => {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na - nb;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

const toScalar = (v: PriceCondition['value']): FactValue =>
  Array.isArray(v) ? String(v) : v;

/** Вычислить одно условие на наборе фактов. Неизвестный/отсутствующий факт → false. */
const evalCondition = (facts: FactSet, cond: PriceCondition): boolean => {
  const fact = facts[cond.fact];
  if (fact === undefined) return false;
  const { op, value } = cond;

  switch (op) {
    case 'eq':
      return compare(fact, toScalar(value)) === 0;
    case 'ne':
      return compare(fact, toScalar(value)) !== 0;
    case 'lt':
      return compare(fact, toScalar(value)) < 0;
    case 'lte':
      return compare(fact, toScalar(value)) <= 0;
    case 'gt':
      return compare(fact, toScalar(value)) > 0;
    case 'gte':
      return compare(fact, toScalar(value)) >= 0;
    case 'in':
      return Array.isArray(value) && value.some((v) => compare(fact, v) === 0);
    case 'between':
      return (
        Array.isArray(value) &&
        value.length === 2 &&
        compare(fact, value[0] as FactValue) >= 0 &&
        compare(fact, value[1] as FactValue) <= 0
      );
  }
};

/** Рекурсивная свёртка предиката. Пустой all → true, пустой any → false. */
export const evalPredicate = (facts: FactSet, predicate: PricePredicate): boolean => {
  switch (predicate.kind) {
    case 'cond':
      return evalCondition(facts, predicate);
    case 'all':
      return predicate.nodes.every((n) => evalPredicate(facts, n));
    case 'any':
      return predicate.nodes.some((n) => evalPredicate(facts, n));
    case 'not':
      return !evalPredicate(facts, predicate.node);
  }
};

/** Ссылается ли предикат на конкретный факт (для разделения «наших» и канальных правил). */
const referencesFact = (predicate: PricePredicate, fact: string): boolean => {
  switch (predicate.kind) {
    case 'cond':
      return predicate.fact === fact;
    case 'all':
    case 'any':
      return predicate.nodes.some((n) => referencesFact(n, fact));
    case 'not':
      return referencesFact(predicate.node, fact);
  }
};

/** Применить корректировку к сумме (minor units, целые). */
const applyAdjustment = (amountMinor: number, adj: PriceAdjustment): number => {
  switch (adj.type) {
    case 'percent':
      return Math.round(amountMinor * (1 + adj.value / 100));
    case 'delta':
      return amountMinor + adj.amountMinor;
    case 'absolute':
      return adj.amountMinor;
  }
};

/** Совместимость со старым именем контекста. */
export type NightlyContext = EvalContext;

/**
 * Чистое ядро прайсинга: цена за одну ночь. Движок — обобщённый интерпретатор предикатов,
 * никакой логики per-rule-type.
 *
 * Порядок:
 *  1. «Наша» цена: override (если задан) ИЛИ база + правила, чьи предикаты НЕ ссылаются на platform,
 *     по возрастанию priority;
 *  2. поверх — канальные правила (предикат ссылается на platform): срабатывают только при ctx.platform.
 *
 * Деньги — целые minor units, результат ≥ 0.
 */
export const computeNightlyPrice = (
  baseMinor: number,
  rules: readonly PriceRule[],
  overrideMinor: number | null,
  ctx: EvalContext,
): number => {
  const facts = buildFacts(ctx);
  const enabled = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  const isChannelRule = (r: PriceRule) => referencesFact(r.match, 'platform');

  let price = overrideMinor ?? baseMinor;

  if (overrideMinor === null) {
    for (const rule of enabled) {
      if (!isChannelRule(rule) && evalPredicate(facts, rule.match)) {
        price = applyAdjustment(price, rule.adjustment);
      }
    }
  }

  for (const rule of enabled) {
    if (isChannelRule(rule) && evalPredicate(facts, rule.match)) {
      price = applyAdjustment(price, rule.adjustment);
    }
  }

  return Math.max(0, Math.round(price));
};

const DAY_MS = 86_400_000;
const addDay = (iso: string): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export type StayQuoteNight = { readonly date: string; readonly amountMinor: number };
export type StayQuoteResult = {
  readonly nights: number;
  readonly totalMinor: number;
  readonly perNight: StayQuoteNight[];
};

/**
 * Чистый расчёт цены проживания: цена за каждую ночь [checkIn, checkOut) по DSL, с фактами
 * length_of_stay и lead_time_days (одинаковы для всех ночей брони) + опц. platform. Сумма — итого.
 */
export const quoteStay = (
  baseMinor: number,
  rules: readonly PriceRule[],
  overrideFor: (date: string) => number | null,
  checkIn: string,
  checkOut: string,
  todayIso: string,
  platform?: Platform,
): StayQuoteResult => {
  const dates: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDay(d)) dates.push(d);
  const lengthOfStay = dates.length;
  const leadTimeDays = Math.max(0, daysBetween(todayIso, checkIn));
  const perNight = dates.map((date) => ({
    date,
    amountMinor: computeNightlyPrice(baseMinor, rules, overrideFor(date), {
      date,
      platform,
      lengthOfStay,
      leadTimeDays,
    }),
  }));
  return { nights: lengthOfStay, totalMinor: perNight.reduce((s, n) => s + n.amountMinor, 0), perNight };
};
