/**
 * Подсчёт суммарной длины швов в укладке.
 *
 * Швы бывают двух типов:
 *  - **продольные** — вертикальные стыки между соседними полосами.
 *    Один шов на каждую границу `placedAtX > 0`. Длина каждого == room.length.
 *  - **поперечные** — горизонтальные стыки внутри одной полосы (между добором
 *    и основным куском). Считаются попарно по соседним pieces в одной колонке
 *    (одинаковый placedAtX), отсортированных по placedAtY: если нижняя
 *    граница верхнего куска совпадает с верхней границей следующего — это шов
 *    длиной == ширина куска (stripWidth).
 */

import type { Piece, Room } from '../types';

export function computeSeamLength(pieces: Piece[], room: Room): number {
  if (pieces.length === 0) return 0;

  let total = 0;

  // === Продольные швы ===
  // Уникальные placedAtX > 0 → каждое значение = одна граница между полосами.
  const longitudinalXs = new Set<number>();
  for (const p of pieces) {
    if (p.placedAtX > 0) {
      longitudinalXs.add(p.placedAtX);
    }
  }
  total += longitudinalXs.size * room.length;

  // === Поперечные швы ===
  // Группируем pieces по placedAtX (внутри одной полосы), сортируем по placedAtY.
  const byColumn = new Map<number, Piece[]>();
  for (const p of pieces) {
    const arr = byColumn.get(p.placedAtX);
    if (arr) {
      arr.push(p);
    } else {
      byColumn.set(p.placedAtX, [p]);
    }
  }

  for (const column of byColumn.values()) {
    column.sort((a, b) => a.placedAtY - b.placedAtY);
    for (let i = 1; i < column.length; i++) {
      const prev = column[i - 1]!;
      const cur = column[i]!;
      if (prev.placedAtY + prev.length === cur.placedAtY) {
        // Поперечный шов длиной == ширина куска (она же ширина полосы).
        total += cur.width;
      }
    }
  }

  return total;
}
