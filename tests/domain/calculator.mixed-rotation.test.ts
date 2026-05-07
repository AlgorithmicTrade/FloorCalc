/**
 * Тесты rotation post-pass в calculateMixed.
 *
 * Rotation pass: после основного greedy-прохода заменяет однородный хвостовой ряд
 * (по одному мелкому замыкающему куску на каждую полосу с единым cutY) одним
 * повёрнутым куском из банка обрезков — если там есть offcut с width>=tailHeight
 * и length>=room.width.
 *
 * Сценарий пользователя: room 21×4.9 м, рулоны [2×20].
 *  Без rotation pass optimal даёт 3 рулона + 3 мелких хвостовых куска (1м каждый).
 *  С rotation pass: те же 3 рулона, но 3 хвостовых куска заменяются одним rotated piece
 *  из хвостового обрезка (rollIndex=1, 2×18 м → 1м × 4.9м повёрнуто).
 *  Итого: 3 рулона, 4 куска, rotated=true у последнего.
 */

import { describe, expect, it } from 'vitest';
import { calculateMixed } from '../../src/domain/calculator/mixed';
import { createRoll, createRoom } from './fixtures';

describe('rotation post-pass', () => {
  describe('Пользовательский сценарий: room 21×4.9 м, рулоны [2×20]', () => {
    // room: width=4900, length=21000.
    // Рулон 2×20: width=2000, length=20000.
    // strips: [2000×21000, 2000×21000, 900×21000].
    //
    // optimal без rotation:
    //   Полоса 0: рулон0 (len=20000), рулон1 (len=1000, хвост 19000 в банк).
    //   Полоса 1: рулон2 (len=20000), из банка (rollIdx=1, len=1000).
    //   Полоса 2: рулон3 (len=20000), из банка (rollIdx=1, len=1000) или из боковины рулона 3.
    //   rollsUsed=4 (счётчик), bank содержит хвосты.
    //
    //   После rotation pass:
    //     cutY=20000, tailHeight=1000, room.width=4900.
    //     bank.findBestFor(1000, 4900) → подходящий хвост → match.
    //     3 хвостовых куска удалены, материал возвращён в банк.
    //     Добавлен 1 rotated piece: width=4900, length=1000, placedAtY=20000, rotated=true.
    //
    //   После compaction post-pass:
    //     Если rollIndex=1 больше не упоминается ни в одной piece (3 хвостовых
    //     удалены, rotated piece пришёл из другого рулона) — он удаляется,
    //     rollsUsed становится 3, индексы remap'ятся в 0..2 без пропусков.
    const room = createRoom('user21x4.9-rotation', 4.9, 21);
    const roll = createRoll(2, 20);

    const opt = calculateMixed(room, [roll], 'optimal');

    it('feasible=true', () => expect(opt.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = opt.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('rollsUsed <= 4 (greedy с rotation post-pass и compaction)', () =>
      expect(opt.rollsUsed).toBeLessThanOrEqual(4));
    it('rollsUsed соответствует уникальным rollIndex в pieces (нет phantom рулонов)', () => {
      const uniqueRollIdx = new Set(opt.pieces.map((p) => p.rollIndex));
      expect(uniqueRollIdx.size).toBe(opt.rollsUsed);
    });
    it('rollIndex в pieces идут без пропусков от 0 до rollsUsed-1', () => {
      const uniqueRollIdx = [...new Set(opt.pieces.map((p) => p.rollIndex))].sort((a, b) => a - b);
      for (let i = 0; i < uniqueRollIdx.length; i++) {
        expect(uniqueRollIdx[i]).toBe(i);
      }
    });
    it('содержит хотя бы один rotated piece', () => {
      const hasRotated = opt.pieces.some((p) => p.rotated === true);
      expect(hasRotated).toBe(true);
    });
    it('rotated piece покрывает весь tail-row: width=room.width', () => {
      const rotated = opt.pieces.filter((p) => p.rotated === true);
      for (const rp of rotated) {
        expect(rp.width).toBe(room.width);
      }
    });
    it('rotated piece начинается после основных кусков (placedAtY > 0)', () => {
      const rotated = opt.pieces.filter((p) => p.rotated === true);
      for (const rp of rotated) {
        expect(rp.placedAtY).toBeGreaterThan(0);
      }
    });
  });

  describe('Без хвостового ряда: room ровно по длине рулона — rotation не применяется', () => {
    // room: width=4000, length=20000. Рулон 2×20 (length=20000).
    // Каждая полоса покрывается одним куском без хвоста (placedAtY=0).
    // Rotation pass: у каждой полосы нет хвостового куска с placedAtY>0 → пропускает.
    const room = createRoom('exact-length', 4, 20);
    const roll = createRoll(2, 20);

    const opt = calculateMixed(room, [roll], 'optimal');

    it('feasible=true', () => expect(opt.feasible).toBe(true));
    it('нет rotated pieces (нет tail-row)', () => {
      const hasRotated = opt.pieces.some((p) => p.rotated === true);
      expect(hasRotated).toBe(false);
    });
    it('покрытая площадь = площадь помещения', () => {
      const covered = opt.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
  });

  describe('Квадратная комната: rotation pass не ломает результат', () => {
    // room 5×5 м, рулон 2×10 м. Стандартный сценарий.
    const room = createRoom('square-5x5', 5, 5);
    const roll = createRoll(2, 10);

    const opt = calculateMixed(room, [roll], 'optimal');
    const econ = calculateMixed(room, [roll], 'economy');

    it('optimal: feasible=true', () => expect(opt.feasible).toBe(true));
    it('economy: feasible=true', () => expect(econ.feasible).toBe(true));
    it('optimal: покрытая площадь = площадь помещения', () => {
      const covered = opt.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('economy: покрытая площадь = площадь помещения', () => {
      const covered = econ.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
  });

  describe('Economy mode: rotation pass тоже применяется при наличии tail-row', () => {
    // room 21×4.9 м, рулон 2×20 м — economy.
    // Economy агрессивно переиспользует банк, структура tail может быть другой.
    // Главное — feasible и корректная площадь.
    const room = createRoom('user21x4.9-econ', 4.9, 21);
    const roll = createRoll(2, 20);

    const econ = calculateMixed(room, [roll], 'economy');

    it('feasible=true', () => expect(econ.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = econ.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
  });

  describe('rotated=true у piece: rollIndex ссылается на существующий рулон', () => {
    // Проверяем, что rollIndex у rotated piece не выходит за rollsUsed.
    const room = createRoom('ref-check', 4.9, 21);
    const roll = createRoll(2, 20);

    const opt = calculateMixed(room, [roll], 'optimal');

    it('все rotated pieces ссылаются на valидный rollIndex', () => {
      for (const p of opt.pieces) {
        if (p.rotated) {
          expect(p.rollIndex).toBeGreaterThanOrEqual(0);
          expect(p.rollIndex).toBeLessThan(opt.rollsUsed);
        }
      }
    });
  });
});
