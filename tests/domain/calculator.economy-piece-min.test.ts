/**
 * Регрессия sub-optimality экономного режима:
 * для одинакового rollsUsed economy должен минимизировать число кусков.
 *
 * Baseline-кейс: room 16×16 м, рулон 2×20 м.
 *   - Greedy `calculateMixed` (mode=economy) даёт 7 рулонов / 13 кусков.
 *   - Геометрически достижимо: 7 рулонов / 11 кусков.
 *
 * Аналитика оптимальной раскладки (room 16×16, roll 2×20):
 *   - 8 полос по 2×16 м покрывают всю комнату (2000 × 8 = 16000).
 *   - 7 полос — целые куски 2×16 из 7 рулонов; от каждого рулона остаётся
 *     боковой/хвостовой обрезок 2×4 (хвост: 20000−16000=4000).
 *   - 8-я полоса собирается из 4 кусков 2×4, взятых из 4 хвостовых обрезков.
 *   - Итого: 7 + 4 = 11 кусков, обрезков остаётся 3×(2×4) = 24 м² (3 нетронутых хвоста).
 *
 * Почему greedy в `mixed.ts` даёт 13 (диагностика, см. полосы):
 *   Шаг `findBestFor(stripWidth, 1)` (src/domain/calculator/mixed.ts:104) ищет
 *   ЛЮБОЙ обрезок шириной ≥ stripWidth и длиной ≥ 1 — в режиме economy. Это
 *   агрессивно расходует короткие хвосты в начало каждой полосы, и для
 *   оставшейся длины приходится открывать НОВЫЙ рулон, который снова даёт
 *   хвост. Результат — каскад фрагментации.
 *   Tie-break в `OffcutBank.findBestFor` (src/domain/calculator/bank.ts:30) —
 *   «минимальная площадь среди подходящих» — добавляет масла в огонь:
 *   маленький обрезок 2×4 предпочитается длинному 2×16 даже когда нужен 2×16.
 *
 *   Конкретные полосы (по симуляции до фикса):
 *     Полоса 0 (x=0):     [2×16]                  ← 1 кусок (свежий рулон, tail 2×4 в bank)
 *     Полоса 1 (x=2000):  [2×4 + 2×12]             ← 2 куска (bank tail 4 + новый рулон 12)
 *     Полоса 2 (x=4000):  [2×8 + 2×8]              ← 2 куска
 *     Полоса 3 (x=6000):  [2×12 + 2×4]             ← 2 куска
 *     Полоса 4 (x=8000):  [2×16]                   ← 1 кусок (целиком из bank)
 *     Полоса 5 (x=10000): [2×16]                   ← 1 кусок (новый рулон)
 *     Полоса 6 (x=12000): [2×4 + 2×12]             ← 2 куска
 *     Полоса 7 (x=14000): [2×8 + 2×8]              ← 2 куска
 *   Итого: 13 кусков, 7 рулонов, ~24-28 М² waste.
 *
 * Фикс — отдельный кандидат `calculateWholeStripFirst` для случая
 * `room.length <= max(roll.length)`: сначала укладываем все полосы, для
 * которых хватает целого рулона; остаточные собираем из bank офкатов и
 * только в последнюю очередь — нового рулона.
 */

import { describe, expect, it } from 'vitest';
import { selectMixed } from '../../src/domain/calculator/selectMixed';
import { createRoll, createRoom } from './fixtures';

describe('economy: минимум кусков при равном rollsUsed', () => {
  describe('16×16 м с рулоном 2×20 → 7 рулонов / 11 кусков', () => {
    const room = createRoom('econ-16x16', 16, 16);
    const roll = createRoll(2, 20);
    const sel = selectMixed(room, [roll], 'economy');

    it('нет ошибки', () => expect('error' in sel).toBe(false));
    it('rollsUsed = 7', () => {
      if ('error' in sel) return;
      expect(sel.result.rollsUsed).toBe(7);
    });
    it('pieces.length = 11 (не 13)', () => {
      if ('error' in sel) return;
      expect(sel.result.pieces.length).toBe(11);
    });
    it('feasible = true', () => {
      if ('error' in sel) return;
      expect(sel.result.feasible).toBe(true);
    });
    it('инвариант: суммарная площадь кусков = площадь комнаты', () => {
      if ('error' in sel) return;
      const covered = sel.result.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });

    // Технологическая практика ремонта: швы стыков мелких кусков обязаны быть
    // у стены, а не посередине комнаты. После reorderStripsEdgeFirst (применяется
    // в selectMixed) единственная multi-piece полоса должна оказаться в крайней
    // позиции по placedAtX — либо 0 (левая стена), либо roomWidth - stripWidth
    // = 16000 - 2000 = 14000 (правая стена). Текущая реализация переставляет
    // multi в конец, поэтому ожидаем placedAtX === 14000.
    it('multi-piece полоса в крайней позиции (placedAtX === 14000)', () => {
      if ('error' in sel) return;
      const byX = new Map<number, typeof sel.result.pieces>();
      for (const p of sel.result.pieces) {
        const arr = byX.get(p.placedAtX) ?? [];
        arr.push(p);
        byX.set(p.placedAtX, arr);
      }
      const multiStrips = [...byX.entries()].filter(([, ps]) => ps.length > 1);
      // Ровно одна multi-piece полоса (4 куска 2×4) в этой раскладке.
      expect(multiStrips).toHaveLength(1);
      const multiX = multiStrips[0]![0];
      // В крайней позиции: либо у левой стены (0), либо у правой (14000).
      expect(multiX === 0 || multiX === 14000).toBe(true);
    });
  });
});
