import styled from '@emotion/styled';

type TextProps = {
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
  weight?: 400 | 500 | 600;
};

/** Текст UI-kit. size + muted + weight. */
export const Text = styled.span<TextProps>(
  ({ theme, size = 'md', muted = false, weight = 400 }) => ({
    fontSize: theme.fontSizes[size],
    fontWeight: weight,
    color: muted ? theme.colors.textMuted : theme.colors.text,
  }),
);
