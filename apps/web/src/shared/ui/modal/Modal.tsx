import styled from '@emotion/styled';
import { useEffect, type ReactNode } from 'react';

const Backdrop = styled.div({
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '48px 16px',
  overflowY: 'auto',
  zIndex: 100,
});

const Panel = styled.div(({ theme }) => ({
  background: theme.colors.surface,
  borderRadius: theme.radii.lg,
  border: `1px solid ${theme.colors.border}`,
  width: '100%',
  maxWidth: 520,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.2)',
}));

/** Модальное окно. Закрытие — по фону или Esc. Контент передаётся children. */
export const Modal = ({ onClose, children }: { onClose: () => void; children: ReactNode }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Backdrop onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>{children}</Panel>
    </Backdrop>
  );
};
