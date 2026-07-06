import type { ReactNode } from 'react';
import {
  closeModalAt,
  closeSidebar,
  mainPath,
  modalStack,
  navigate,
  sidebarPath,
  useLocation,
  type Location,
} from '../shared/lib/router';
import { matchRoute } from './routes';
import { useMe } from '../entities/auth';
import { AuthPage } from '../pages/auth/AuthPage';
import { Link, Modal, Sidebar, Stack, Text } from '../shared/ui';
import { Nav } from './Nav';
import { ReadOnlyBanner } from '../widgets/read-only-banner/ReadOnlyBanner';

const NotFound = () => (
  <Stack as="main" css={(t) => ({ padding: t.space(6) })}>
    <Text>Страница не найдена</Text>
  </Stack>
);

/** Полноэкранный показ overlay-роута (прямой переход / новая вкладка): back-ссылка + голый контент. */
const PageShell = ({
  parent,
  backLabel,
  children,
}: {
  parent: string;
  backLabel: string;
  children: ReactNode;
}) => (
  <Stack as="main" gap={2} css={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 0' }}>
    <Link to={parent}>{backLabel}</Link>
    {children}
  </Stack>
);

/** Поверхность main: страница по location.path. Overlay-роут показывается полноэкранно (PageShell). */
const renderMain = (path: string): ReactNode => {
  const match = matchRoute(path);
  if (!match) return <NotFound />;
  const { route, params } = match;
  if (route.page) {
    const parent = route.page.parent(params);
    const close = () => navigate({ path: parent, slots: {} });
    return (
      <PageShell parent={parent} backLabel={route.page.backLabel}>
        {route.render(params, { close })}
      </PageShell>
    );
  }
  return route.render(params, { close: () => navigate({ path, slots: {} }) });
};

/** Поверхность modal: каждый адрес стека → отдельная модалка, close = pop этого уровня. */
const renderModal = (location: Location, modalPath: string, index: number): ReactNode => {
  const match = matchRoute(modalPath);
  if (!match) return null;
  // replace, чтобы back не «воскрешал» только что закрытую модалку.
  const close = () => navigate(closeModalAt(location, index), { replace: true });
  return (
    <Modal key={`${index}:${modalPath}`} onClose={close}>
      {match.route.render(match.params, { close })}
    </Modal>
  );
};

/** Поверхность sidebar: один адрес справа, close = убрать слот. */
const renderSidebar = (location: Location, path: string): ReactNode => {
  const match = matchRoute(path);
  if (!match) return null;
  const close = () => navigate(closeSidebar(location), { replace: true });
  return <Sidebar onClose={close}>{match.route.render(match.params, { close })}</Sidebar>;
};

export const App = () => {
  const me = useMe();
  const location = useLocation();
  const path = mainPath(location);

  // Публичные роуты (гость, возврат после оплаты) — без авторизации и без Nav.
  const main = matchRoute(path);
  if (main?.route.public) {
    const close = () => navigate({ path: '/', slots: {} });
    return <>{main.route.render(main.params, { close })}</>;
  }

  if (me.isLoading) {
    return (
      <Stack css={{ padding: 24 }}>
        <Text muted>Загрузка…</Text>
      </Stack>
    );
  }

  // Не авторизован → страница входа/регистрации.
  if (!me.data) {
    return <AuthPage />;
  }

  const sidebar = sidebarPath(location);
  const modals = modalStack(location);

  return (
    <>
      <Nav />
      <ReadOnlyBanner />
      {renderMain(path)}
      {sidebar !== null && renderSidebar(location, sidebar)}
      {modals.map((modalPath, index) => renderModal(location, modalPath, index))}
    </>
  );
};
