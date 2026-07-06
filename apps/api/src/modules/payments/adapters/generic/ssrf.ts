/**
 * SSRF-гард для generic-провайдеров: endpoint приходит из рук арендодателя.
 * Чистая функция — только https и публичный хост. Блокируем loopback/private/link-local,
 * чтобы подключённый сторонний провайдер не смог дёрнуть внутреннюю сеть.
 */
const PRIVATE_HOST = /^(localhost|.*\.local)$/i;

const isPrivateIpv4 = (host: string): boolean => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
};

export const isPublicHttpsUrl = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return false; // IPv6 loopback/ULA
  if (PRIVATE_HOST.test(host)) return false;
  if (isPrivateIpv4(host)) return false;
  return true;
};
