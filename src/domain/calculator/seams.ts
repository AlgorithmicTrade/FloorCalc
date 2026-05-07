/**
 * Подсчёт швов в укладке.
 *
 * Швы бывают двух типов:
 *  - **продольные** — вертикальные стыки между соседними полосами.
 *    Один шов на каждую уникальную границу `placedAtX > 0`.
 *  - **поперечные** — горизонтальные стыки внутри одной полосы (между добором
 *    и основным куском). Считаются попарно по соседним pieces в одной колонке
 *    (одинаковый placedAtX), отсортированных по placedAtY: если нижняя
 *    граница верхнего куска совпадает с верхней границей следующего — это шов.
 */

import type { Piece, Room } from '../types';

/**
 * Вспомогательная функция — строит колонки (группировка по placedAtX).
 */
function buildColumns(pieces: Piece[]): Map<number, Piece[]> {
  const byColumn = new Map<number, Piece[]>();
  for (const p of pieces) {
    const arr = byColumn.get(p.placedAtX);
    if (arr) {
      arr.push(p);
    } else {
      byColumn.set(p.placedAtX, [p]);
    }
  }
  return byColumn;
}

/**
 * Считает **количество** дискретных швов.
 *  - Продольный шов = каждое уникальное `placedAtX > 0` (одна вертикальная линия).
 *  - Поперечный шов = каждая пара соседних pieces в колонке,
 *    у которых `prev.placedAtY + prev.length === cur.placedAtY`.
 */
export function computeSeamCount(pieces: Piece[], _room: Room): number {
  if (pieces.length === 0) return 0;

  // === Продольные швы ===
  const longitudinalXs = new Set<number>();
  for (const p of pieces) {
    if (p.placedAtX > 0) {
      longitudinalXs.add(p.placedAtX);
    }
  }
  let count = longitudinalXs.size;

  // === Поперечные швы ===
  const byColumn = buildColumns(pieces);
  for (const column of byColumn.values()) {
    column.sort((a, b) => a.placedAtY - b.placedAtY);
    for (let i = 1; i < column.length; i++) {
      const prev = column[i - 1]!;
      const cur = column[i]!;
      if (prev.placedAtY + prev.length === cur.placedAtY) {
        count++;
      }
    }
  }

  return count;
}

/**
 * @deprecated Используйте `computeSeamCount`. Оставлена для обратной совместимости.
 * Считает суммарную длину швов (мм) — для тестов, которые проверяют длину.
 */
export function computeSeamLength(pieces: Piece[], room: Room): number {
  if (pieces.length === 0) return 0;

  let total = 0;

  const longitudinalXs = new Set<number>();
  for (const p of pieces) {
    if (p.placedAtX > 0) {
      longitudinalXs.add(p.placedAtX);
    }
  }
  total += longitudinalXs.size * room.length;

  const byColumn = buildColumns(pieces);
  for (const column of byColumn.values()) {
    column.sort((a, b) => a.placedAtY - b.placedAtY);
    for (let i = 1; i < column.length; i++) {
      const prev = column[i - 1]!;
      const cur = column[i]!;
      if (prev.placedAtY + prev.length === cur.placedAtY) {
        total += cur.width;
      }
    }
  }

  return total;
}
