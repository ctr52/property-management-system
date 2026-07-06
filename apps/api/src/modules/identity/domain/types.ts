import type { Role } from '@pms/shared';

export type Organization = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
};

export type User = {
  readonly id: string;
  readonly orgId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly createdAt: string;
};

/** Сессия. id = SHA-256 хеш токена; сырой токен в БД не хранится. */
export type Session = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly createdAt: string;
};

/** Кладётся в контекст запроса после requireAuth. */
export type AuthContext = {
  readonly userId: string;
  readonly orgId: string;
  readonly email: string;
  readonly role: Role;
};
