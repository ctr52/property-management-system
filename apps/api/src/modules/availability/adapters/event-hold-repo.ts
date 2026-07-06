import type { EventBus } from '../../../shared/event-bus';
import type { HoldRepo } from '../ports/hold-repo';

/**
 * Декоратор HoldRepo: после реального изменения занятости публикует availability.changed.
 * Эмиссия живёт ровно на границе авторитета доступности — кто бы hold ни менял
 * (вставка/вытеснение/промоушн/истечение/снятие).
 */
export const withAvailabilityEvents = (inner: HoldRepo, bus: EventBus): HoldRepo => ({
  insertIfFree: async (hold, now) => {
    const result = await inner.insertIfFree(hold, now);
    if (result.isOk()) {
      // Изменилась занятость объекта (и для вытесненных — тот же объект).
      bus.publish({ type: 'availability.changed', orgId: hold.orgId, propertyId: hold.propertyId });
    }
    return result;
  },
  promote: async (orgId, id, now) => {
    const hold = await inner.getById(orgId, id); // нужен propertyId для события (tentative ещё жив)
    await inner.promote(orgId, id, now);
    if (hold) {
      bus.publish({ type: 'availability.changed', orgId, propertyId: hold.propertyId });
    }
  },
  releaseExpired: async (now) => {
    const released = await inner.releaseExpired(now);
    for (const propertyId of new Set(released.map((h) => h.propertyId))) {
      const sample = released.find((h) => h.propertyId === propertyId);
      if (sample) bus.publish({ type: 'availability.changed', orgId: sample.orgId, propertyId });
    }
    return released;
  },
  remove: async (orgId, id) => {
    const hold = await inner.getById(orgId, id); // нужен propertyId для события
    await inner.remove(orgId, id);
    if (hold) {
      bus.publish({ type: 'availability.changed', orgId, propertyId: hold.propertyId });
    }
  },
  listForRange: inner.listForRange,
  getById: inner.getById,
});
