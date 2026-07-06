import styled from '@emotion/styled';

/** Карточка-контейнер UI-kit. */
export const Card = styled.div(({ theme }) => ({
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.md,
  padding: theme.space(3),
  background: theme.colors.surface,
}));
