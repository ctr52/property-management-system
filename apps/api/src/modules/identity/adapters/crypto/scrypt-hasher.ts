import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher } from '../../ports/security';

// Явная обёртка: promisify не подхватывает overload scrypt с options.
const scryptAsync = (password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });

// Параметры scrypt (OWASP-приемлемо). N=2^15, r=8, p=1. maxmem с запасом под N.
const N = 32_768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 128 * N * R * 2;

const SCHEME = 'scrypt';

/**
 * Хешер паролей на scrypt из node:crypto — без нативных зависимостей.
 * Формат: scrypt$N$r$p$saltB64$hashB64. Заменяется на argon2id сменой этого адаптера.
 */
export const createScryptHasher = (): PasswordHasher => ({
  hash: async (password) => {
    const salt = randomBytes(16);
    const derived = (await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })) as Buffer;
    return `${SCHEME}$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
  },
  verify: async (password, stored) => {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== SCHEME) {
      return false;
    }
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64 ?? '', 'base64');
    const expected = Buffer.from(hashB64 ?? '', 'base64');
    if (expected.length === 0) {
      return false;
    }
    const derived = (await scryptAsync(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: MAXMEM,
    })) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  },
});
