/**
 * Регрессия «ровной укладки» экономного режима.
 *
 * До post-pass `groupPiecesByLengthDescendingPerColumn` greedy-алгоритм
 * клал в каждую полосу обрезок (placedAtY=0), а свежий main — ниже
 * (placedAtY=offcut.length). Это давало хаотичную картинку, в которой
 * стыки main/offcut перемешаны по Y без структуры. Post-pass сортирует
 * куски в каждой полосе по убыванию `length` — длинные сверху, доборы
 * снизу. Инварианты `rollsUsed`/`pieceCount`/`feasible` сохранены.
 *
 * Опорный кейс пользователя: помещение 13 × 7.6 м, рулон 1.5 × 15 м.
 * Раскладка: 5 рулонов, 11 кусков, 10 швов, waste 13.70 м².
 */

import { describe, expect, it } from 'vitest';
import { calculateEconomy } from '../../src/domain/calculator/economy';
import { selectMixed } from '../../src/domain/calculator/selectMixed';
import { createRoll, createRoom } from './fixtures';

describe('economy: ровная укладка внутри полос (post-pass sort-by-length)', () => {
  describe('помещение 7.6×13 м, рулон 1.5×15 м', () => {
    // По convention fixtures: createRoom(name, widthM, lengthM) — width=поперёк рулона.
    // У пользователя помещение 13×7.6 м с горизонтальной укладкой полос вдоль
    // room.length=13. Для domain-расчёта это эквивалентно width=7.6, length=13.
    const room = createRoom('econ-7.6x13', 7.6, 13);
    const roll = createRoll(1.5, 15);
    const r = calculateEconomy(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('5 рулонов', () => expect(r.rollsUsed).toBe(5));
    it('11 кусков', () => expect(r.pieces).toHaveLength(11));
    it('10 швов', () => expect(r.seamCount).toBe(10));
    it('waste = 13.70 м²', () => expect(r.wasteAreaMm2).toBe(13_700_000));

    it('инвариант ровной укладки: внутри каждой полосы length убывает по Y', () => {
      const byColumn = new Map<number, typeof r.pieces>();
      for (const piece of r.pieces) {
        if (piece.rotated === true) continue;
        const col = byColumn.get(piece.placedAtX) ?? [];
        col.push(piece);
        byColumn.set(piece.placedAtX, col);
      }
      for (const [, column] of byColumn) {
        column.sort((a, b) => a.placedAtY - b.placedAtY);
        for (let i = 1; i < column.length; i++) {
          expect(column[i]!.length).toBeLessThanOrEqual(column[i - 1]!.length);
        }
      }
    });

    it('инвариант: длинные main-куски лежат на placedAtY=0 в каждой полосе', () => {
      const byColumn = new Map<number, typeof r.pieces>();
      for (const piece of r.pieces) {
        if (piece.rotated === true) continue;
        const col = byColumn.get(piece.placedAtX) ?? [];
        col.push(piece);
        byColumn.set(piece.placedAtX, col);
      }
      for (const [, column] of byColumn) {
        const top = column.reduce((acc, c) => (c.placedAtY < acc.placedAtY ? c : acc));
        expect(top.placedAtY).toBe(0);
      }
    });

    it('инвариант: pieces плотно лежат в полосе (Σ length внутри полосы = room.length)', () => {
      const byColumn = new Map<number, typeof r.pieces>();
      for (const piece of r.pieces) {
        if (piece.rotated === true) continue;
        const col = byColumn.get(piece.placedAtX) ?? [];
        col.push(piece);
        byColumn.set(piece.placedAtX, col);
      }
      for (const [, column] of byColumn) {
        const sumLength = column.reduce((s, c) => s + c.length, 0);
        expect(sumLength).toBe(room.length);
      }
    });

    it('идентичен selectMixed(economy) — UI вызывает именно его', () => {
      const sel = selectMixed(room, [roll], 'economy');
      expect('error' in sel).toBe(false);
      if ('error' in sel) return;
      expect(sel.result.rollsUsed).toBe(r.rollsUsed);
      expect(sel.result.pieces.length).toBe(r.pieces.length);
      expect(sel.result.seamCount).toBe(r.seamCount);
    });
  });

  describe('classic scenario: 6×10 м, рулон 4×30 м (Сценарий 2b)', () => {
    // calculateEconomy: 1 рулон, 2 piece, seamCount=1.
    // Полоса A (x=0, w=4): новый рулон, кусок 4×10, хвост 4×20 в bank.
    // Полоса B (x=4000, w=2): bank.findBestFor(2,1) → хвост 4×20 → кусок 2×10.
    // Только одна piece на каждую полосу — post-pass не делает свопов.
    const room = createRoom('econ-6x10', 6, 10);
    const roll = createRoll(4, 30);
    const r = calculateEconomy(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон / 2 piece / 1 шов сохранены', () => {
      expect(r.rollsUsed).toBe(1);
      expect(r.pieces).toHaveLength(2);
      expect(r.seamCount).toBe(1);
    });
    it('каждая полоса покрывает room.length одним куском', () => {
      for (const piece of r.pieces) {
        expect(piece.placedAtY).toBe(0);
        expect(piece.length).toBe(room.length);
      }
    });
  });
});
