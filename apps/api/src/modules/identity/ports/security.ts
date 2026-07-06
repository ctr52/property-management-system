/** Хеширование паролей. Реализация (scrypt) скрыта за портом — заменяема на argon2id. */
export type PasswordHasher = {
  readonly hash: (password: string) => Promise<string>;
  readonly verify: (password: string, hash: string) => Promise<boolean>;
};

export type GeneratedToken = {
  /** Сырой токен — уходит в cookie клиенту. */
  readonly raw: string;
  /** Хеш токена — хранится в БД как id сессии. */
  readonly hash: string;
};

export type TokenGenerator = {
  readonly generate: () => GeneratedToken;
  readonly hash: (raw: string) => string;
};
