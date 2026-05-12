/**
 * Post-process для результатов раскроя.
 *
 * Назначение: переставляет полосы (strips) так, чтобы полосы, собранные из
 * нескольких кусков (multi-piece — наследие банка обрезков), оказывались с
 * КРАЯ помещения, а не в середине.
 *
 * Технологическое обоснование (WHY): на ремонте мелкие куски всегда кладут
 * со стороны стены, чтобы швы стыков обрезков не оказались посередине комнаты,
 * где они визуально и эксплуатационно нежелательны (нагрузка от мебели,
 * проходимость, расхождение шва). Алгоритм раскроя оптимизирует число рулонов
 * и кусков, но не учитывает физическое расположение полос — это делает данный
 * post-process.
 *
 * Контракт:
 *  - Pure-функция, input не мутируется.
 *  - Сохраняет инварианты: pieces.length, sum(area), seamCount, rollsUsed,
 *    rollIndex/rollTypeId/sourceX/sourceY/width/length/rotated/placedAtY каждого
 *    куска. Меняется только placedAtX (новые позиции по полосам).
 *  - Выбран вариант «multi-piece — в КОНЕЦ» (placedAtX max). Альтернатива
 *    «в начало» (placedAtX=0) даёт зеркальный layout — обе равноправны с точки
 *    зрения «у стены», эмпирически выбран хвост (правая стена).
 */

import type { Piece } from '../types';

/**
 * Группа pieces, относящихся к одной полосе (один и тот же исходный placedAtX).
 */
type Strip = {
  /** Исходная позиция X полосы — для стабильной сортировки single-strip-ов. */
  originalX: number;
  /** Ширина полосы (одинакова у всех pieces внутри). */
  width: number;
  /** Все pieces полосы (порядок placedAtY сохраняется как пришёл). */
  pieces: Piece[];
};

/**
 * Переставляет полосы так, чтобы multi-piece полосы (size > 1) оказались
 * в конце (с правой стены), single-piece — в начале.
 *
 * Алгоритм:
 *  1. Группируем pieces по `placedAtX` → strips.
 *  2. Сортируем: single (size===1) сначала, multi (size>1) в конце.
 *     Внутри single — стабильно по originalX. Внутри multi — стабильно по originalX.
 *  3. Реассоциируем placedAtX: новая X = sum(widths) предыдущих strips.
 *  4. Возвращаем перемаппленные pieces в новом порядке.
 *
 * Edge cases:
 *  - pieces пустой → [].
 *  - 1 strip → копия без изменений.
 *  - Все single или все multi → копия в исходном порядке (стабильность).
 *
 * @param pieces исходный массив кусков (не мутируется).
 * @param roomWidth ширина помещения, mm. Используется для проверки инварианта
 *   sum(strip.width) === roomWidth (если выполняется покрытие полное).
 *   Сейчас не валидируется (см. NOTE), но передаётся в API для будущего расширения.
 * @returns новый массив pieces с обновлёнными placedAtX.
 */
export function reorderStripsEdgeFirst(
  pieces: readonly Piece[],
  roomWidth: number,
): Piece[] {
  // NOTE: roomWidth получаем для контракта (валидация / будущая логика
  // двустороннего edge-выбора). Сейчас перестановка всегда «multi → конец».
  void roomWidth;

  if (pieces.length === 0) return [];

  // === Шаг 1: группировка по placedAtX ===
  // Сохраняем порядок добавления для стабильности — потому что Map.values()
  // в JS итерируется в порядке вставки ключей.
  const byX = new Map<number, Strip>();
  for (const p of pieces) {
    const existing = byX.get(p.placedAtX);
    if (existing) {
      existing.pieces.push(p);
    } else {
      byX.set(p.placedAtX, {
        originalX: p.placedAtX,
        width: p.width,
        pieces: [p],
      });
    }
  }

  // Если всего одна полоса — возвращаем копию без изменений (placedAtX тот же).
  if (byX.size <= 1) return pieces.map((p) => ({ ...p }));

  // === Guard: layout не является «vertical strip layout» ===
  // Контракт reorder требует, чтобы pieces одной полосы имели одинаковую width
  // (это инвариант алгоритмов calculateMixed/calculateWholeStripFirst в
  // native-ориентации — все pieces одной strip нарезаются на одной stripWidth).
  //
  // Однако selectMixed применяет reorder и к swap-back кандидатам: pieces
  // рассчитаны для swappedRoom (width↔length), потом транспонированы:
  //   placedAtX := исходный placedAtY (cursorX свапнутой полосы),
  //   placedAtY := исходный placedAtX (placedAtY внутри свапнутой полосы),
  //   width    := исходная length, length := исходная width.
  // В таком layout «полосы» горизонтальные (одинаковый placedAtY, разные placedAtX),
  // а группировка по placedAtX сваливает в одну группу pieces РАЗНЫХ свап-полос —
  // у них совпадает placedAtX (например, 0 — начало каждой свап-полосы), но
  // width получается разный (это p.length из разных кусков свап-полосы).
  //
  // Признак: хотя бы одна группа byX содержит pieces с разной width.
  // В таком случае reorder математически некорректен (cursorX += strip.width
  // с шириной одного «представителя» даст placedAtX, выходящий за room.width).
  // Безопасное no-op — вернуть копию без переупорядочивания: layout оставлен
  // как есть, координаты гарантированно валидны (так его и собрал основной
  // алгоритм для swappedRoom + транспозиция).
  for (const strip of byX.values()) {
    const w0 = strip.pieces[0]!.width;
    for (let i = 1; i < strip.pieces.length; i++) {
      if (strip.pieces[i]!.width !== w0) {
        return pieces.map((p) => ({ ...p }));
      }
    }
  }

  // === Шаг 2: сортировка ===
  // Сначала разделяем strips по типам, сохраняя исходный порядок (стабильность).
  const singles: Strip[] = [];
  const multis: Strip[] = [];
  for (const strip of byX.values()) {
    if (strip.pieces.length > 1) multis.push(strip);
    else singles.push(strip);
  }

  // Если все strips одного типа — нечего переставлять, возвращаем копию.
  if (singles.length === 0 || multis.length === 0) {
    return pieces.map((p) => ({ ...p }));
  }

  // Дополнительная сортировка по originalX внутри групп — чтобы порядок
  // single-полос между собой соответствовал их исходному расположению
  // (полоса 0, потом полоса 1, ... — без перетасовки).
  singles.sort((a, b) => a.originalX - b.originalX);
  multis.sort((a, b) => a.originalX - b.originalX);

  // Финальный порядок strips: [single..., multi...].
  const ordered: Strip[] = [...singles, ...multis];

  // === Шаг 3-4: реассоциация placedAtX и сборка результата ===
  // Новая X для k-й полосы = сумма ширин предыдущих 0..k-1.
  const out: Piece[] = [];
  let cursorX = 0;
  for (const strip of ordered) {
    for (const p of strip.pieces) {
      out.push({ ...p, placedAtX: cursorX });
    }
    cursorX += strip.width;
  }

  return out;
}
