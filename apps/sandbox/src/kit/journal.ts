export type LogDir = 'in' | 'out' | 'info';
export type LogEntry = { readonly at: string; readonly dir: LogDir; readonly title: string; readonly detail: string };

/** Кольцевой журнал событий эмулятора (для панели). У каждого эмулятора свой. */
export type Journal = {
  readonly add: (dir: LogDir, title: string, detail?: string) => void;
  readonly list: () => readonly LogEntry[];
};

export const createJournal = (cap = 60): Journal => {
  const items: LogEntry[] = [];
  return {
    add: (dir, title, detail = '') => {
      items.unshift({ at: new Date().toISOString(), dir, title, detail });
      if (items.length > cap) items.pop();
    },
    list: () => items,
  };
};
