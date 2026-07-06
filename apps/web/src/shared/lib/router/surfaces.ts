import type { Location } from './core';

/**
 * Уровень 3 (механика) — поверхности лэйаута поверх generic-слотов уровня 2.
 * Это чистые функции «как читать/менять Location»; сами экраны (реестр) живут в app/.
 *
 *   main    = location.path
 *   sidebar = слот 'sidebar' (один адрес)
 *   modal   = слот 'modal' (упорядоченный стек)
 */
export type Surface = 'main' | 'sidebar' | 'modal';

// --- чтение поверхностей ---

export const mainPath = (loc: Location): string => loc.path;
export const sidebarPath = (loc: Location): string | null => loc.slots.sidebar?.[0] ?? null;
export const modalStack = (loc: Location): readonly string[] => loc.slots.modal ?? [];

// --- описание перехода ссылкой (см. Link) ---

/** Операция над стеком модалок: строка = push (шорткат), либо явный глагол, либо null = закрыть все. */
export type ModalChange =
  | string
  | { readonly push: string }
  | { readonly replace: string }
  | { readonly set: readonly string[] }
  | null;

/**
 * Цель ссылки = до трёх поверхностей. Что НЕ передано (`undefined`) — наследуется из
 * текущего Location (вариант A: ноль магии, смена одной поверхности не трогает остальные).
 */
export type LinkTarget = {
  readonly main?: string;
  readonly sidebar?: string | null;
  readonly modal?: ModalChange;
};

const applyModal = (stack: readonly string[], change: ModalChange): readonly string[] => {
  if (change === null) return [];
  if (typeof change === 'string') return [...stack, change];
  if ('push' in change) return [...stack, change.push];
  if ('replace' in change) return [...stack.slice(0, -1), change.replace];
  return change.set;
};

const withSlot = (
  slots: Readonly<Record<string, readonly string[]>>,
  key: string,
  value: readonly string[] | null,
): Record<string, readonly string[]> => {
  const next = { ...slots };
  if (value === null || value.length === 0) delete next[key];
  else next[key] = value;
  return next;
};

/** Чистое применение цели ссылки к текущему Location с наследованием непереданных поверхностей. */
export const applyTarget = (current: Location, target: LinkTarget): Location => {
  let slots: Record<string, readonly string[]> = { ...current.slots };
  if (target.sidebar !== undefined) {
    slots = withSlot(slots, 'sidebar', target.sidebar === null ? null : [target.sidebar]);
  }
  if (target.modal !== undefined) {
    slots = withSlot(slots, 'modal', applyModal(current.slots.modal ?? [], target.modal));
  }
  return { path: target.main ?? current.path, slots };
};

/**
 * Нативная цель ссылки — куда реально ведёт `<a href>` при открытии в новой вкладке / прямом
 * заходе / Ctrl-клике. Модалка — это оверлей поверх текущей страницы, у неё нет собственного
 * standalone-URL: воспроизвести `?modal=…` в новой вкладке = снова показать модалку (а не контент
 * страницей). Поэтому адрес, который ссылка вводит в стек модалок, промотируем в `main` — overlay-
 * роут сам отрисуется полноэкранно (page-хром). Если ссылка модалку не вводит — обычный applyTarget.
 */
export const nativeTarget = (current: Location, target: LinkTarget): Location => {
  const applied = applyTarget(current, target);
  // Только когда ссылка адресует модалку (push/replace/set с адресом) — иначе унаследованный стек
  // не наш, трогать его нельзя (напр. back-ссылка внутри модалки меняет лишь main).
  if (target.modal === undefined || target.modal === null) return applied;
  const stack = applied.slots.modal ?? [];
  const top = stack[stack.length - 1];
  if (top === undefined) return applied;
  return { path: top, slots: withSlot(applied.slots, 'modal', null) };
};

// --- закрытие поверхностей (передаётся как `close` в render роута) ---

export const closeModalAt = (current: Location, index: number): Location => ({
  ...current,
  slots: withSlot(
    current.slots,
    'modal',
    (current.slots.modal ?? []).filter((_, i) => i !== index),
  ),
});

export const closeSidebar = (current: Location): Location => ({
  ...current,
  slots: withSlot(current.slots, 'sidebar', null),
});
