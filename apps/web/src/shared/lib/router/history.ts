/**
 * Уровень 1 — история-порт. ЕДИНСТВЕННОЕ место, которое знает про браузер (window.history).
 * Всё выше работает через этот интерфейс, поэтому роутер переносится в тесты/натив (WebView)
 * простой заменой реализации порта (см. createMemoryHistory).
 */
export type HistorySnapshot = {
  /** pathname без query, напр. `/properties/123`. */
  readonly path: string;
  /** raw query вместе с `?`, напр. `?modal=%2Fproperties%2Fnew`. */
  readonly search: string;
};

export type HistoryPort = {
  read(): HistorySnapshot;
  push(url: string): void;
  replace(url: string): void;
  subscribe(listener: () => void): () => void;
};

// pushState/replaceState не шлют popstate — рассылаем своё событие для in-app навигаций.
const NAVIGATE_EVENT = 'pms:navigate';

/** Браузерная реализация порта (прод). */
export const createBrowserHistory = (): HistoryPort => ({
  read: () => ({ path: window.location.pathname, search: window.location.search }),
  push: (url) => {
    window.history.pushState(null, '', url);
    window.dispatchEvent(new Event(NAVIGATE_EVENT));
  },
  replace: (url) => {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event(NAVIGATE_EVENT));
  },
  subscribe: (listener) => {
    window.addEventListener('popstate', listener);
    window.addEventListener(NAVIGATE_EVENT, listener);
    return () => {
      window.removeEventListener('popstate', listener);
      window.removeEventListener(NAVIGATE_EVENT, listener);
    };
  },
});

/** In-memory реализация порта (тесты, натив). История не нужна — храним текущий url. */
export const createMemoryHistory = (initial = '/'): HistoryPort => {
  let current = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const split = (url: string): HistorySnapshot => {
    const q = url.indexOf('?');
    return q === -1 ? { path: url, search: '' } : { path: url.slice(0, q), search: url.slice(q) };
  };
  return {
    read: () => split(current),
    push: (url) => {
      current = url;
      emit();
    },
    replace: (url) => {
      current = url;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
