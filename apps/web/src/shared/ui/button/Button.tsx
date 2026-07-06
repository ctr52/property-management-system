import styled from '@emotion/styled';

type ButtonVariant = 'primary' | 'secondary';

/** Базовая кнопка UI-kit. variant: primary (по умолчанию) | secondary. */
export const Button = styled.button<{ variant?: ButtonVariant }>(
  ({ theme, variant = 'primary' }) => ({
    padding: `${theme.space(2)} ${theme.space(3)}`,
    fontSize: theme.fontSizes.md,
    borderRadius: theme.radii.md,
    cursor: 'pointer',
    border: `1px solid ${variant === 'primary' ? theme.colors.primary : theme.colors.border}`,
    background: variant === 'primary' ? theme.colors.primary : 'transparent',
    color: variant === 'primary' ? theme.colors.primaryText : theme.colors.text,
    '&:disabled': {
      opacity: 0.6,
      cursor: 'default',
    },
  }),
);
