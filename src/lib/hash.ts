/**
 * Детерминированный «отпечаток» для ключа кеша расчётов.
 *
 * Используется в resultsCache: при одинаковом наборе входов мы хотим
 * получить одинаковую строку и пропустить пересчёт. Hash должен меняться
 * при смене размеров помещения, состава активных рулонов или режима.
 *
 * roomId присутствует в ключе намеренно: у двух комнат может быть
 * одинаковая геометрия, но мы хотим разные кеши — иначе UX странный
 * (переименование/удаление путает результаты).
 */

import type { RollType } from '@/domain/types';

/**
 * Стабильный отпечаток для (room + selected rolls + mode).
 * Сортировка списка рулонов по `<id>:<width>x<length>` гарантирует,
 * что порядок добавления рулонов в каталог не влияет на ключ.
 */
export function hashCalculationKey(args: {
  roomId: string;
  roomWidth: number;
  roomLength: number;
  rolls: ReadonlyArray<Pick<RollType, 'id' | 'width' | 'length'>>;
  mode: 'economy' | 'optimal';
}): string {
  const sortedRolls = [...args.rolls]
    .map((r) => `${r.id}:${r.width}x${r.length}`)
    .sort()
    .join('|');
  return `${args.roomId}::${args.roomWidth}x${args.roomLength}::${args.mode}::${sortedRolls}`;
}
