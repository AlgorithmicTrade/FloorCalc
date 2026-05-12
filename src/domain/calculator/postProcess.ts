/**
 * Post-process утилиты для геометрической перекомпоновки уже рассчитанной
 * раскладки. Меняют ТОЛЬКО геометрические поля (`placedAtY`) — никогда не
 * трогают идентичность куска (`rollIndex`, `rollTypeId`, `sourceX`, `sourceY`,
 * `width`, `length`, `rotated`). Поэтому инварианты `rollsUsed`, `pieceCount`,
 * `feasible` и `coveredArea` сохраняются by construction.
 */

import type { Piece } from '../types';

/**
 * Внутри каждой вертикальной полосы (`placedAtX`) сортирует обычные куски
 * по `length` убывающе и переписывает `placedAtY` подряд. Длинные main-куски
 * оказываются сверху полосы, короткие доборы — снизу. Это устраняет «хаос»
 * экономного режима, при котором свежий рулон и хвостовой обрезок чередуются
 * по Y (см. `economy.ts`: для каждой полосы сначала берётся offcut из bank
 * на placedAtY=0, потом новый рулон правее offcut'а).
 *
 * Rotated-куски (`piece.rotated === true`) пропускаются: они занимают всю
 * ширину помещения (placedAtX=0, length=room.width) и не принадлежат
 * вертикальной полосе. Их позиция сохраняется как есть.
 *
 * Порядок элементов в исходном массиве `pieces` не сохраняется — возвращается
 * новый массив, отсортированный по (placedAtX, placedAtY).
 *
 * Влияние на seams: продольные швы (число уникальных `placedAtX > 0`)
 * не меняются. Поперечные швы (стыки `prev.placedAtY+prev.length === cur.placedAtY`
 * внутри колонки) — могут перераспределиться, но их количество остаётся тем же,
 * т.к. куски в полосе плотно прилегают друг к другу как до, так и после
 * сортировки (Σ length одинакова).
 */
export function groupPiecesByLengthDescendingPerColumn(
  pieces: readonly Piece[]
): Piece[] {
  if (pieces.length === 0) return [];

  /* Разделяем на rotated (особый случай) и регулярные. */
  const rotated: Piece[] = [];
  const byColumn = new Map<number, Piece[]>();
  for (const p of pieces) {
    if (p.rotated === true) {
      rotated.push(p);
      continue;
    }
    const col = byColumn.get(p.placedAtX);
    if (col) {
      col.push(p);
    } else {
      byColumn.set(p.placedAtX, [p]);
    }
  }

  /* Сортируем колонки по placedAtX, чтобы выход был детерминирован. */
  const sortedXs = [...byColumn.keys()].sort((a, b) => a - b);

  const out: Piece[] = [];
  for (const x of sortedXs) {
    const column = byColumn.get(x)!;
    /* Длинные сверху, короткие снизу. Стабильность не критична, но
       используем монотонный compare. */
    column.sort((a, b) => b.length - a.length);
    let curY = 0;
    for (const p of column) {
      out.push({ ...p, placedAtY: curY });
      curY += p.length;
    }
  }

  /* Rotated-куски добавляем в конец без изменения placedAtY. */
  for (const r of rotated) out.push(r);

  return out;
}
