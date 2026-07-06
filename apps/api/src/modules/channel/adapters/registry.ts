import type { Platform } from '../domain/types';
import type { ChannelAdapter } from '../ports/adapter';
import type { AdapterRegistry } from '../ports/repos';

/** Реестр адаптеров по платформам. */
export const createAdapterRegistry = (adapters: readonly ChannelAdapter[]): AdapterRegistry => {
  const byPlatform = new Map<Platform, ChannelAdapter>(adapters.map((a) => [a.platform, a]));
  return {
    get: (platform) => byPlatform.get(platform) ?? null,
  };
};
