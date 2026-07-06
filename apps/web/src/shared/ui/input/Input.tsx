import styled from '@emotion/styled';

/** Базовое текстовое поле UI-kit. */
export const Input = styled.input(({ theme }) => ({
  padding: `${theme.space(2)} ${theme.space(2.5)}`,
  fontSize: theme.fontSizes.md,
  borderRadius: theme.radii.md,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.bg,
  color: theme.colors.text,
  '&:focus': {
    outline: 'none',
    borderColor: theme.colors.link,
  },
}));
