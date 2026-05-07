/**
 * Zod-схемы для runtime-валидации (защита от corrupted data.json).
 *
 * Все размеры в mm: положительные integer.
 *
 * Тип StoredCatalog здесь продублирован локально (в Phase 1 ещё нет
 * `src/shared/ipc-contract.ts`). Когда Phase 2 создаст ipc-contract,
 * этот тип станет re-export'ом из `@shared/ipc-contract`.
 */

import { z } from 'zod';
import type { RollType, Room } from './types';

/** Положительный integer (mm). */
const positiveIntMm = z
  .number()
  .int('Размер должен быть целым числом миллиметров')
  .positive('Размер должен быть больше нуля');

export const RollTypeSchema = z.object({
  id: z.string().min(1, 'id рулона не может быть пустым'),
  width: positiveIntMm,
  length: positiveIntMm
}) satisfies z.ZodType<RollType>;

export const RoomSchema = z.object({
  id: z.string().min(1, 'id помещения не может быть пустым'),
  name: z.string(),
  width: positiveIntMm,
  length: positiveIntMm
}) satisfies z.ZodType<Room>;

/**
 * Структура `data.json` из storage.
 * Дублируется здесь для Phase 1; в Phase 2 будет re-export из ipc-contract.
 */
export type StoredCatalog = {
  schemaVersion: 1;
  rolls: RollType[];
  selectedRollIds: string[];
};

export const StoredCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  rolls: z.array(RollTypeSchema),
  selectedRollIds: z.array(z.string())
}) satisfies z.ZodType<StoredCatalog>;

/**
 * Валидация загруженного каталога.
 * @throws ZodError если структура некорректна.
 */
export function validateCatalog(input: unknown): StoredCatalog {
  return StoredCatalogSchema.parse(input);
}
