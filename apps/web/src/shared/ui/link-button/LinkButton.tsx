import styled from '@emotion/styled';
import { Link } from '../link/Link';

/**
 * Ссылка-кнопка: выглядит как primary-кнопка, но это наш <Link/> — левый клик делает
 * клиентский переход (модальный роут), а Ctrl/Cmd-клик / средняя кнопка / новая вкладка
 * отдаются браузеру (откроется отдельной страницей). Для основных действий-переходов.
 */
export const LinkButton = styled(Link)(({ theme }) => ({
  display: 'inline-block',
  padding: `${theme.space(2)} ${theme.space(3)}`,
  fontSize: theme.fontSizes.md,
  borderRadius: theme.radii.md,
  border: `1px solid ${theme.colors.primary}`,
  background: theme.colors.primary,
  color: theme.colors.primaryText,
  textDecoration: 'none',
  cursor: 'pointer',
  '&:hover': { textDecoration: 'none', filter: 'brightness(0.95)' },
}));
