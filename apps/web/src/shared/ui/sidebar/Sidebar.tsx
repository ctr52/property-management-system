import styled from '@emotion/styled';
import { useEffect, type ReactNode } from 'react';

const Aside = styled.aside(({ theme }) => ({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: 420,
  background: theme.colors.surface,
  borderLeft: `1px solid ${theme.colors.border}`,
  boxShadow: '-12px 0 40px rgba(0, 0, 0, 0.15)',
  overflowY: 'auto',
  zIndex: 90,
}));

/** Правая выезжающая панель (поверхность sidebar). Закрытие — по Esc. Контент — children. */
export const Sidebar = ({ onClose, children }: { onClose: () => void; children: ReactNode }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <Aside>{children}</Aside>;
};
