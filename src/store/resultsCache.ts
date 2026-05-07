/**
 * Кеш результатов расчёта.
 *
 * Не Zustand: reactive обёртка не нужна — UI и так перерисовывается
 * по событиям catalogStore/roomsStore, а сам результат вычисляется
 * императивно в ResultCard. Map даёт O(1) lookup и предсказуемое поведение.
 *
 * Стратегия eviction: FIFO по порядку вставки. Когда размер достигает
 * MAX_ENTRIES, удаляем самый старый ключ (Map в JS итерирует в порядке
 * insertion, так что `keys().next()` — это самая ранняя запись).
 */

import type { CalculationResult } from '@/domain/types';

const cache = new Map<string, CalculationResult>();
/** Верхняя граница размера кеша. 64 = ~16 комнат × 2 режима × 2 типа рулона
 * — с большим запасом для типичной сессии пользователя. */
const MAX_ENTRIES = 64;

export const resultsCache = {
  get(key: string): CalculationResult | null {
    return cache.get(key) ?? null;
  },

  set(key: string, value: CalculationResult): void {
    if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
      // Eviction только когда добавляем НОВЫЙ ключ; обновление существующего
      // не должно вытеснять чужую запись.
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, value);
  },

  clear(): void {
    cache.clear();
  },

  delete(key: string): void {
    cache.delete(key);
  }
};
