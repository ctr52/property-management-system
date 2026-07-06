/**
 * Базовые порты-абстракции, общие для всех модулей.
 * Реализации (адаптеры) внедряются в composition root (src/index.ts).
 */
export type Clock = {
  readonly now: () => Date;
};

export type IdGen = () => string;
