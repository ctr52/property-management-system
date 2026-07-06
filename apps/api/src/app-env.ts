import type { AuthContext } from './modules/identity/domain/types';

export type { AuthContext };

/** Тип окружения Hono: переменные контекста, доступные в защищённых роутах. */
export type AppEnv = {
  Variables: {
    auth: AuthContext;
  };
};
