import { useCallback, useSyncExternalStore } from 'react';
import { createBrowserHistory, type HistoryPort, type HistorySnapshot } from './history';

/**
 * Уровень 2 — кросс-платформенный роутер. Про браузер не знает (только про порт уровня 1).
 * Оперирует СТРУКТУРНОЙ локацией, а не строкой: основной адрес + именованные слоты-стеки.
 * Сериализация Location ↔ строка и декларативный матчинг паттернов живут здесь.
 */
export type Location = {
  /** Основной адрес (поверхность main). */
  readonly path: string;
  /** Именованные слоты → упорядоченные «под-адреса» (напр. { modal: ['/properties/new'] }). */
  readonly slots: Readonly<Record<string, readonly string[]>>;
};

export type Params = Readonly<Record<string, string>>;

// --- сериализация Location ↔ строка (слоты ⇄ query-параметры) ---

const parse = ({ path, search }: HistorySnapshot): Location => {
  const slots: Record<string, string[]> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    (slots[key] ??= []).push(value);
  }
  return { path, slots };
};

export const stringify = ({ path, slots }: Location): string => {
  const params = new URLSearchParams();
  for (const key of Object.keys(slots).sort()) {
    for (const value of slots[key] ?? []) params.append(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
};

// --- декларативный матчинг по сегментам (никаких сырых regex в коде приложения) ---

const segments = (path: string): string[] => path.split('/').filter((s) => s.length > 0);

/**
 * Сопоставляет паттерн вида `/properties/:id/settings` с путём. Возвращает параметры
 * (`{ id: '123' }`) или null. Совпадение строгое по числу сегментов.
 */
export const matchPath = (pattern: string, path: string): Params | null => {
  const pat = segments(pattern);
  const seg = segments(path);
  if (pat.length !== seg.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pat.length; i += 1) {
    const p = pat[i];
    const s = seg[i];
    if (p === undefined || s === undefined) return null;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(s);
    else if (p !== s) return null;
  }
  return params;
};

// --- стор поверх порта (реактивный для React через useSyncExternalStore) ---

// Композиционный корень может подменить порт (тесты/натив) до первого рендера.
let port: HistoryPort = createBrowserHistory();
export const setHistory = (next: HistoryPort): void => {
  port = next;
};

// useSyncExternalStore требует стабильную ссылку при отсутствии изменений → кэшируем по ключу.
let cachedKey: string | null = null;
let cachedLocation: Location = { path: '/', slots: {} };

const getSnapshot = (): Location => {
  const snap = port.read();
  const key = snap.path + snap.search;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedLocation = parse(snap);
  }
  return cachedLocation;
};

const SERVER_LOCATION: Location = { path: '/', slots: {} };
const subscribe = (listener: () => void) => port.subscribe(listener);

export const useLocation = (): Location =>
  useSyncExternalStore(subscribe, getSnapshot, () => SERVER_LOCATION);

/** Текущий основной путь как реактивное значение. */
export const useLocationPath = (): string => useLocation().path;

// --- навигация ---

/** Новый Location: либо целиком, либо функция-апдейтер от текущего (для наследования слотов). */
export type LocationChange = Location | ((current: Location) => Location);
export type NavigateOptions = { readonly replace?: boolean };

export const navigate = (change: LocationChange, options?: NavigateOptions): void => {
  const next = typeof change === 'function' ? change(getSnapshot()) : change;
  const url = stringify(next);
  if (options?.replace) port.replace(url);
  else port.push(url);
};

export const useNavigate = () =>
  useCallback(
    (change: LocationChange, options?: NavigateOptions) => navigate(change, options),
    [],
  );
