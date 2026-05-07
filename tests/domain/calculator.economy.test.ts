/**
 * Тесты экономного режима.
 *
 * Convention: createRoom(name, widthM, lengthM) — width = поперёк рулона,
 * length = вдоль рулона. Рулон 4×30 = ширина 4 м, длина 30 м.
 *
 * Сценарии нумерованы как в плане §3.7 (`docs/plans/agile-prancing-pnueli.md`).
 * Где фактический результат greedy-алгоритма расходится с цифрами плана —
 * комментарий объясняет расхождение и помечает как известное ограничение MVP.
 */

import { describe, expect, it } from 'vitest';
import { calculateEconomy } from '../../src/domain/calculator/economy';
import { createRoll, createRoom } from './fixtures';

describe('calculateEconomy', () => {
  describe('Сценарий 1 (план §3.7): помещение 5×3 м, рулон 4×30 м', () => {
    // План: «5 × 3 м». По convention направления: width = короткая (3),
    // length = длинная (5). Полоса 3 ≤ roll.width=4, длина 5 ≤ roll.length=30.
    // Один кусок покрывает всё.
    const room = createRoom('s1', 3, 5);
    const roll = createRoll(4, 30);
    const r = calculateEconomy(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('1 piece покрывает всё помещение', () => {
      expect(r.pieces).toHaveLength(1);
      expect(r.pieces[0]).toMatchObject({
        rollIndex: 0,
        width: 3000,
        length: 5000,
        placedAtX: 0,
        placedAtY: 0
      });
    });
    it('0 швов', () => expect(r.totalSeamLengthMm).toBe(0));
    it('обрезки в банке: 1×5 м (боковой) + 4×25 м (хвост рулона)', () => {
      // Боковой: width=4000-3000=1000, length=5000 → 5_000_000 mm²
      // Хвост:   width=4000, length=30000-5000=25000 → 100_000_000 mm²
      expect(r.wasteAreaMm2).toBe(5_000_000 + 100_000_000);
    });
    it('warnings пустые (помещение помещается в один рулон)', () => {
      expect(r.warnings).toEqual([]);
    });
  });

  describe('Сценарий 2b (план §3.7): помещение 6×10 м, рулон 4×30 м', () => {
    // План §3.7 говорит «rollsUsed=1, швы=20м, 3 куска из одного 4×30».
    // ФАКТИЧЕСКИЙ результат greedy:
    //  - Полоса A (x=0, width=4000, length=10000): берём из нового рулона 0,
    //    остаётся хвост 4000×20000 в банке.
    //  - Полоса B (x=4000, width=2000, length=10000): подходит хвост из банка
    //    (width=4000≥2000, length=20000≥10000) → consume → используем 2000×10000
    //    из хвоста.
    // Итого: 1 рулон, 2 piece, 1 продольный шов длиной 10000, 0 поперечных.
    // План §3.7 (3 куска + 20м швов) предполагает другую разбивку
    // (например, 3 полосы 4/4/4 в горизонтальной ориентации); это будущая
    // оптимизация порядка укладки. MVP-greedy решает задачу проще.
    const room = createRoom('s2b', 6, 10);
    const roll = createRoll(4, 30);
    const r = calculateEconomy(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон (банк хвоста переиспользован для второй полосы)', () =>
      expect(r.rollsUsed).toBe(1));
    it('2 piece (A: 4×10, B: 2×10)', () => expect(r.pieces).toHaveLength(2));
    it('швы = 10 м (один продольный, поперечных нет) — ОТЛИЧАЕТСЯ от плана §3.7 (20 м)', () => {
      // План ожидает 2 продольных шва (~20м), что подразумевает 3 полосы
      // 4/4/2. У нас одно roll.width=4000 ≥ оставшихся 2000 → одна граница.
      expect(r.totalSeamLengthMm).toBe(10_000);
    });
  });

  describe('Сценарий 4 (план §3.7): помещение 8×3 м, рулон 6×4 м (ширина рулона 4)', () => {
    // План: «8 × 3 м, 4 × 6 м, economy → rollsUsed=2 (бок 1×6 не годится для 3×2)».
    // Convention: width=3 (поперёк), length=8 (вдоль). Рулон width=4, length=6.
    // Полоса x=0 stripWidth=3 needLen=8000:
    //  - iter1: roll 0, useLen=6000. piece(0, w=3, l=6, y=0). боковой 1×6 в банк, хвост нет.
    //  - iter2: needLen=2000. findBestFor(3000,1): банк {w=1000,l=6000} — width<3000 → null.
    //    roll 1, useLen=2000. piece(1, w=3, l=2, y=6000). боковой 1×2 в банк, хвост 4×4 в банк.
    // rollsUsed=2, 1 поперечный шов = 3000.
    const room = createRoom('s4', 3, 8);
    const roll = createRoll(4, 6);
    const r = calculateEconomy(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('2 рулона (боковой 1×6 не подходит для добора шириной 3)', () =>
      expect(r.rollsUsed).toBe(2));
    it('2 piece', () => expect(r.pieces).toHaveLength(2));
    it('1 поперечный шов = 3000 mm', () => expect(r.totalSeamLengthMm).toBe(3000));
    it('warning о длине помещения > длины рулона', () => {
      expect(r.warnings).toContain('Помещение длиннее рулона — потребуются поперечные доборы');
    });
  });

  describe('Сценарий 5 (план §3.7): помещение 4×30 м, рулон 4×30 м', () => {
    const room = createRoom('s5', 4, 30);
    const roll = createRoll(4, 30);
    const r = calculateEconomy(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('0 швов', () => expect(r.totalSeamLengthMm).toBe(0));
    it('wasteArea = 0', () => expect(r.wasteAreaMm2).toBe(0));
    it('1 piece покрывает всё', () => {
      expect(r.pieces).toHaveLength(1);
      expect(r.pieces[0]).toMatchObject({ width: 4000, length: 30_000 });
    });
  });

  describe('Сценарий 6 (план §3.7): помещение 3×4 м, рулон 4×30 м', () => {
    const room = createRoom('s6', 3, 4);
    const roll = createRoll(4, 30);
    const r = calculateEconomy(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('0 швов', () => expect(r.totalSeamLengthMm).toBe(0));
  });

  describe('Граничные случаи', () => {
    it('пустое помещение (width=0) → feasible=false, warning', () => {
      const room = { id: 'empty', name: 'empty', width: 0, length: 5000 };
      const roll = createRoll(4, 30);
      const r = calculateEconomy(room, roll);
      expect(r.feasible).toBe(false);
      expect(r.rollsUsed).toBe(0);
      expect(r.pieces).toHaveLength(0);
      expect(r.warnings).toContain('Помещение не задано');
    });

    it('некорректный рулон (width=0) → throw', () => {
      const room = createRoom('r', 3, 5);
      const badRoll = { id: 'bad', width: 0, length: 30_000 };
      expect(() => calculateEconomy(room, badRoll)).toThrow();
    });
  });
});
