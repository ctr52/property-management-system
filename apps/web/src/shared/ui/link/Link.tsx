import styled from '@emotion/styled';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import {
  applyTarget,
  navigate,
  nativeTarget,
  stringify,
  useLocation,
  type LinkTarget,
  type ModalChange,
} from '../../lib/router';

const Anchor = styled.a(({ theme }) => ({
  color: theme.colors.link,
  textDecoration: 'none',
  '&:hover': {
    textDecoration: 'underline',
  },
}));

type LinkProps = {
  /** Обязательный: основной адрес (поверхность main). По чистому левому клику — клиентский роутинг. */
  to: string;
  /** Поверхность sidebar: строка — открыть, `null` — закрыть, не передан — оставить как есть. */
  sidebar?: string | null;
  /**
   * Поверхность modal (стек): `'/x'` = push поверх, `{ replace }`/`{ set }` — иные операции,
   * `null` — закрыть все, не передан — оставить стек как есть.
   */
  modal?: ModalChange;
  /**
   * Опционально переопределить реальный `<a href>` (нативные действия браузера). По умолчанию
   * href = сериализованный результат перехода → новая вкладка/Ctrl-клик дают тот же Location.
   */
  nativeHref?: string;
  children: ReactNode;
  // `href` запрещаем напрямую, чтобы не путать с `to`/`nativeHref`.
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export const Link = ({ to, sidebar, modal, nativeHref, children, onClick, target, ...rest }: LinkProps) => {
  const current = useLocation();
  const linkTarget: LinkTarget = { main: to, sidebar, modal };
  // href = «куда реально приведёт нативное действие браузера»: модалка не имеет standalone-URL,
  // поэтому в новой вкладке/прямом заходе её адрес показывается полноэкранной страницей (nativeTarget),
  // а не воспроизводит оверлей. Левый клик при этом по-прежнему открывает модалку (applyTarget ниже).
  const href = nativeHref ?? stringify(nativeTarget(current, linkTarget));

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    const isModifiedClick =
      event.button !== 0 || // не левая кнопка (напр. средняя — новая вкладка)
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === '_blank';

    // Модифицированные/не-левые клики отдаём браузеру — он нативно откроет href.
    if (event.defaultPrevented || isModifiedClick) {
      return;
    }

    event.preventDefault();
    navigate((loc) => applyTarget(loc, linkTarget));
  };

  return (
    <Anchor href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </Anchor>
  );
};
