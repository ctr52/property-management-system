import styled from '@emotion/styled';

/** Многострочный ввод UI-kit (для шаблонов/заметок). */
export const Textarea = styled.textarea(({ theme }) => ({
  padding: `${theme.space(2)} ${theme.space(2.5)}`,
  fontSize: theme.fontSizes.sm,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  lineHeight: 1.5,
  minHeight: '120px',
  borderRadius: theme.radii.md,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.bg,
  color: theme.colors.text,
  resize: 'vertical',
  '&:focus': {
    outline: 'none',
    borderColor: theme.colors.link,
  },
}));
