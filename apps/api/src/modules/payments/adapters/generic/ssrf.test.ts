import { describe, expect, it } from 'vitest';
import { isPublicHttpsUrl } from './ssrf';

describe('isPublicHttpsUrl (SSRF-гард для endpoint арендодателя)', () => {
  it('публичный https → true', () => {
    expect(isPublicHttpsUrl('https://pay.example.com/webhook')).toBe(true);
  });
  it('http (не tls) → false', () => {
    expect(isPublicHttpsUrl('http://pay.example.com')).toBe(false);
  });
  it('localhost → false', () => {
    expect(isPublicHttpsUrl('https://localhost/x')).toBe(false);
  });
  it('*.local → false', () => {
    expect(isPublicHttpsUrl('https://router.local/x')).toBe(false);
  });
  it('loopback 127.0.0.1 → false', () => {
    expect(isPublicHttpsUrl('https://127.0.0.1/x')).toBe(false);
  });
  it('private 10.x → false', () => {
    expect(isPublicHttpsUrl('https://10.1.2.3/x')).toBe(false);
  });
  it('private 172.16–31 → false', () => {
    expect(isPublicHttpsUrl('https://172.20.0.1/x')).toBe(false);
  });
  it('private 192.168 → false', () => {
    expect(isPublicHttpsUrl('https://192.168.0.1/x')).toBe(false);
  });
  it('link-local 169.254 → false', () => {
    expect(isPublicHttpsUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
  });
  it('IPv6 loopback ::1 → false', () => {
    expect(isPublicHttpsUrl('https://[::1]/x')).toBe(false);
  });
  it('мусор → false', () => {
    expect(isPublicHttpsUrl('not a url')).toBe(false);
  });
});
