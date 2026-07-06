import { createHash, randomBytes } from 'node:crypto';
import type { TokenGenerator } from '../../ports/security';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Сессионные токены: 256 бит энтропии, base64url. В БД хранится только SHA-256 хеш,
 * поэтому утечка БД не даёт пригодных токенов.
 */
export const createTokenGenerator = (): TokenGenerator => ({
  generate: () => {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: sha256(raw) };
  },
  hash: sha256,
});
