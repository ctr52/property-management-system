import type { Role } from './auth.schema';

/** Гранулярные права (resource:action). Источник правды для бэка и фронта. */
export const PERMISSIONS = [
  'property:read',
  'property:write',
  'listing:read',
  'listing:write',
  'channel:read',
  'channel:manage',
  'calendar:read',
  'payment:read',
  'payment:manage',
  'payment:confirm',
  'cleaning:read', // видеть доску уборок (все задачи)
  'cleaning:assign', // назначать клинера
  'cleaning:work', // свои задачи: взять в работу / завершить
  'notification:read', // свои уведомления
  'report:read', // отчёты по загрузке/выручке
  'commission:read', // отчёт по комиссиям площадок
  'commission:manage', // настройка ставок комиссий per-channel
  'org:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const owner: readonly Permission[] = [...PERMISSIONS];

const manager: readonly Permission[] = [
  'property:read',
  'property:write',
  'listing:read',
  'listing:write',
  'channel:read',
  'channel:manage',
  'calendar:read',
  'payment:read',
  'payment:manage',
  'payment:confirm',
  'cleaning:read',
  'cleaning:assign',
  'cleaning:work',
  'notification:read',
  'report:read',
  'commission:read',
  'commission:manage',
];

// Клинер: объекты/календарь (read) + свои задачи уборки + уведомления.
const cleaner: readonly Permission[] = [
  'property:read',
  'calendar:read',
  'cleaning:work',
  'notification:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = { owner, manager, cleaner };

/** Чистая проверка прав. Одна и та же логика на бэке (guard) и на фронте (скрытие UI). */
export const can = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);
