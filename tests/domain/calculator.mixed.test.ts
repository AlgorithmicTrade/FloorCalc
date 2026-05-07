/**
 * Тесты mixed-type расчёта.
 *
 * Проверяем calculateMixed и selectMixed:
 *  - С одним активным рулоном → результат совпадает с mono-type по покрытию.
 *  - С двумя рулонами разной ширины → pieces могут содержать разные rollTypeId.
 *  - Пустой список → feasible=false, warning.
 *  - Помещение шире max(roll.width) → feasible=false, warning.
 */

import { describe, expect, it } from 'vitest';
import { calculateMixed } from '../../src/domain/calculator/mixed';
import { selectMixed } from '../../src/domain/calculator/selectMixed';
import { calculateEconomy } from '../../src/domain/calculator/economy';
import { createRoll, createRoom } from './fixtures';

describe('calculateMixed', () => {
  describe('Пустой список активных рулонов', () => {
    const room = createRoom('empty', 3, 5);
    const r = calculateMixed(room, [], 'economy');

    it('feasible=false', () => expect(r.feasible).toBe(false));
    it('rollsUsed=0', () => expect(r.rollsUsed).toBe(0));
    it('pieces пустые', () => expect(r.pieces).toHaveLength(0));
    it('warning о нет активных рулонов', () =>
      expect(r.warnings).toContain('Нет активных рулонов'));
  });

  describe('Помещение не задано (width=0)', () => {
    const room = { id: 'z', name: 'z', width: 0, length: 5000 };
    const roll = createRoll(4, 30);
    const r = calculateMixed(room, [roll], 'economy');

    it('feasible=false', () => expect(r.feasible).toBe(false));
    it('warning о неопределённом помещении', () =>
      expect(r.warnings).toContain('Помещение не задано'));
  });

  describe('Помещение шире одного рулона — укладывается несколькими полосами', () => {
    // room.width=6000 мм, roll.width=4000 мм → 2 полосы (4000 + 2000).
    // Это штатный сценарий, feasible=true.
    const room = createRoom('wide', 6, 5);
    const roll = createRoll(4, 30);
    const r = calculateMixed(room, [roll], 'economy');

    it('feasible=true (покрывается несколькими полосами)', () =>
      expect(r.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = r.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
  });

  describe('1 активный рулон, economy — эквивалент mono-type', () => {
    // room 3×5 м, рулон 4×30 м (оба в метрах).
    const room = createRoom('mono', 3, 5);
    const roll = createRoll(4, 30);
    const rMixed = calculateMixed(room, [roll], 'economy');
    const rMono = calculateEconomy(room, roll);

    it('feasible совпадает', () => expect(rMixed.feasible).toBe(rMono.feasible));
    it('rollsUsed совпадает', () => expect(rMixed.rollsUsed).toBe(rMono.rollsUsed));
    it('seamCount совпадает', () => expect(rMixed.seamCount).toBe(rMono.seamCount));
    it('wasteAreaMm2 совпадает', () => expect(rMixed.wasteAreaMm2).toBe(rMono.wasteAreaMm2));
    it('количество pieces совпадает', () =>
      expect(rMixed.pieces).toHaveLength(rMono.pieces.length));
    it('все pieces имеют rollTypeId рулона', () => {
      for (const p of rMixed.pieces) {
        expect(p.rollTypeId).toBe(roll.id);
      }
    });
    it('primary rollTypeId — тот же рулон', () =>
      expect(rMixed.rollTypeId).toBe(roll.id));
  });

  describe('2 рулона разной ширины — 6×10 м', () => {
    // Помещение 6×10 м (width=6000, length=10000).
    // Рулон A: 4×30 м (width=4000), Рулон B: 3×20 м (width=3000).
    // maxRollWidth=4000, планирует 2 полосы: [w=4000, w=2000].
    //
    // Полоса 0 (stripWidth=4000): candidates = {A} (B.width=3000 < 4000).
    //   → открывает рулон A. useLen=10000. Хвост A в банке: {w=4000, len=20000}.
    //
    // Полоса 1 (stripWidth=2000): findBestFor(2000,1) → хвост A подходит (4000>=2000).
    //   → piece из обрезка A. rollTypeId=A.id.
    //
    // Итого: 1 рулон A, 2 piece (оба rollTypeId=A), feasible=true, 1 продольный шов.
    const room = createRoom('mixed6x10', 6, 10);
    const rollA = createRoll(4, 30);
    const rollB = createRoll(3, 20);
    const r = calculateMixed(room, [rollA, rollB], 'economy');

    it('feasible=true', () => expect(r.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = r.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('seamCount >= 1 (минимум 1 продольный)', () =>
      expect(r.seamCount).toBeGreaterThanOrEqual(1));
    it('primary rollTypeId = rollA (единственный пригодный для широкой полосы)', () =>
      expect(r.rollTypeId).toBe(rollA.id));
  });

  describe('2 рулона одинаковой ширины — mixed rollTypeId в pieces', () => {
    // Помещение 3×15 м (width=3000, length=15000).
    // Рулон A: 3×10 м → покрывает 10000 мм длины, хвост 0.
    // Рулон B: 3×8  м → покрывает 8000 мм длины, хвост 0.
    // maxRollWidth=3000, 1 полоса (stripWidth=3000, need=15000).
    //
    // economy: chooseBestRoll([A,B], 3000, 15000):
    //   |A.length-15000|=|10000-15000|=5000
    //   |B.length-15000|=|8000-15000|=7000
    //   → A (меньший diff). useLen=10000, хвост нет (10000=need? нет, need=15000>10000).
    //   Хвост: A.length=10000, useLen=10000 → нет хвоста (10000=10000).
    //   needLength теперь 15000-10000=5000.
    //   bank пуст → chooseBestRoll([A,B], 3000, 5000):
    //   |A-5000|=5000, |B-5000|=3000 → B выбран. useLen=min(8000,5000)=5000.
    //   Хвост B: 8000-5000=3000 → в банке.
    //
    // Итого: 2 рулона (A и B), pieces=[{rollTypeId=A}, {rollTypeId=B}].
    const room = createRoom('seq', 3, 15);
    const rollA = createRoll(3, 10);
    const rollB = createRoll(3, 8);
    const r = calculateMixed(room, [rollA, rollB], 'economy');

    it('feasible=true', () => expect(r.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = r.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('2 рулона использовано', () => expect(r.rollsUsed).toBe(2));
    it('pieces содержат два разных rollTypeId', () => {
      const ids = new Set(r.pieces.map((p) => p.rollTypeId));
      expect(ids.size).toBe(2);
    });
  });

  describe('2 рулона: оба пригодны для всех полос, economy выбирает меньший waste', () => {
    // Помещение 3×5 м (width=3000, length=5000).
    // Рулон A: 4×30 → waste=большой (хвост 25м + боковой)
    // Рулон B: 3×5  → ровно в размер, waste=0.
    // economy: |A.length-5000|=25000, |B.length-5000|=0 → выбирается B.
    const room = createRoom('exact', 3, 5);
    const rollA = createRoll(4, 30);
    const rollB = createRoll(3, 5); // id='roll-3x5', ровно под комнату

    const r = calculateMixed(room, [rollA, rollB], 'economy');

    it('feasible=true', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('primary rollTypeId — рулон B (меньший waste)', () =>
      expect(r.rollTypeId).toBe(rollB.id));
    it('wasteArea=0 (рулон точно под размер)', () => expect(r.wasteAreaMm2).toBe(0));
  });

  describe('optimal-mode: выбирается рулон с наибольшим достаточным length', () => {
    // Помещение 3×5 м.
    // Рулон A: 3×5, Рулон B: 3×30.
    // optimal: sufficient = [A(5000>=5000), B(30000>=5000)].
    // Наибольший length среди sufficient → B(30000 > 5000):
    //   длинный хвост (25000 мм) останется в банке и сможет покрыть следующую полосу
    //   целиком без поперечного шва.
    // Но здесь только одна полоса (room.width=3000 <= roll.width=3000):
    //   useLen=5000, хвост B: 30000-5000=25000 → wasteAreaMm2=75_000_000.
    // rollsUsed=1, primary rollTypeId = B.
    const room = createRoom('opt', 3, 5);
    const rollA = createRoll(3, 5);
    const rollB = createRoll(3, 30);

    const r = calculateMixed(room, [rollA, rollB], 'optimal');

    it('feasible=true', () => expect(r.feasible).toBe(true));
    it('primary rollTypeId — рулон B (наибольший sufficient.length = длинный хвост)', () =>
      expect(r.rollTypeId).toBe(rollB.id));
    it('wasteAreaMm2 = хвост B: 3×25 м = 75_000_000', () =>
      expect(r.wasteAreaMm2).toBe(75_000_000));
    it('rollsUsed=1 (одна полоса, один рулон)', () => expect(r.rollsUsed).toBe(1));
  });
});

describe('selectMixed', () => {
  it('пустой список → error', () => {
    const room = createRoom('e', 3, 5);
    const r = selectMixed(room, [], 'economy');
    expect('error' in r).toBe(true);
  });

  it('возвращает roll = primary type', () => {
    const room = createRoom('s', 3, 5);
    const roll = createRoll(4, 30);
    const r = selectMixed(room, [roll], 'economy');
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.roll.id).toBe(roll.id);
      expect(r.result.feasible).toBe(true);
    }
  });
});
