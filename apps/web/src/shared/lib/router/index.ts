// Уровень 1 — история-порт (браузер/память).
export { createBrowserHistory, createMemoryHistory } from './history';
export type { HistoryPort, HistorySnapshot } from './history';

// Уровень 2 — кросс-платформенный роутер (Location, навигация, матчинг).
export {
  matchPath,
  navigate,
  setHistory,
  stringify,
  useLocation,
  useLocationPath,
  useNavigate,
} from './core';
export type { Location, LocationChange, NavigateOptions, Params } from './core';

// Уровень 3 (механика) — поверхности лэйаута.
export {
  applyTarget,
  closeModalAt,
  closeSidebar,
  mainPath,
  modalStack,
  nativeTarget,
  sidebarPath,
} from './surfaces';
export type { LinkTarget, ModalChange, Surface } from './surfaces';
