import styled from '@emotion/styled';

/** Заголовок UI-kit. */
export const Heading = styled.h1(({ theme }) => ({
  fontSize: theme.fontSizes.xl,
  fontWeight: 600,
  margin: 0,
  color: theme.colors.text,
}));
