import styled from '@emotion/styled';

type StackProps = {
  /** Отступ между детьми в шагах сетки (theme.space). По умолчанию 2 → 8px. */
  gap?: number;
  direction?: 'row' | 'column';
  align?: 'stretch' | 'center' | 'flex-start' | 'flex-end';
  justify?: 'flex-start' | 'center' | 'space-between' | 'flex-end';
};

/** Flex-раскладка UI-kit. Базовый примитив верстки вместо инлайн-стилей. */
export const Stack = styled.div<StackProps>(
  ({ theme, gap = 2, direction = 'column', align = 'stretch', justify = 'flex-start' }) => ({
    display: 'flex',
    flexDirection: direction,
    alignItems: align,
    justifyContent: justify,
    gap: theme.space(gap),
  }),
);
