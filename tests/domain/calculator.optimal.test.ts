/**
 * Тесты оптимального режима.
 *
 * Convention: createRoom(name, widthM, lengthM) — width = поперёк рулона,
 * length = вдоль рулона.
 *
 * В optimal каждая полоса начинается со свежего рулона, обрезки не
 * переиспользуются — гарантирован минимум стыков, но больше отходов.
 */

import { describe, expect, it } from 'vitest';
import { calculateOptimal } from '../../src/domain/calculator/optimal';
import { createRoll, createRoom } from './fixtures';

describe('calculateOptimal', () => {
  describe('Сценарий 1 (план §3.7): помещение 5×3 м (width=3, length=5), рулон 4×30 м', () => {
    const room = createRoom('s1', 3, 5);
    const roll = createRoll(4, 30);
    const r = calculateOptimal(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('1 piece', () => expect(r.pieces).toHaveLength(1));
    it('0 швов', () => expect(r.seamCount).toBe(0));
    it('waste = площадь рулона − площадь покрытия', () => {
      // 4000×30000 − 3000×5000 = 120_000_000 − 15_000_000 = 105_000_000
      expect(r.wasteAreaMm2).toBe(105_000_000);
    });
  });

  describe('Сценарий 2 (план §3.7): помещение 10×6 м (width=10, length=6), рулон 4×30 м', () => {
    // 3 полосы → 2 продольных шва → seamCount=2.
    const room = createRoom('s2', 10, 6);
    const roll = createRoll(4, 30);
    const r = calculateOptimal(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('3 рулона (по одному на каждую полосу)', () => expect(r.rollsUsed).toBe(3));
    it('3 piece (по одному в полосе)', () => expect(r.pieces).toHaveLength(3));
    it('2 продольных шва (≠ план §3.7 «20м»)', () => {
      // План использует room.length=10м (другая интерпретация ориентации).
      // Здесь seamCount = 2 уникальных placedAtX > 0.
      expect(r.seamCount).toBe(2);
    });
  });

  describe('Сценарий 3 (план §3.7): помещение 50×4 м (width=4, length=50), рулон 4×30 м', () => {
    // Одна полоса, 2 куска → 1 поперечный шов → seamCount=1.
    const room = createRoom('s3', 4, 50);
    const roll = createRoll(4, 30);
    const r = calculateOptimal(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('2 рулона', () => expect(r.rollsUsed).toBe(2));
    it('2 piece (30 м + 20 м)', () => {
      expect(r.pieces).toHaveLength(2);
      expect(r.pieces[0]).toMatchObject({ length: 30_000, placedAtY: 0 });
      expect(r.pieces[1]).toMatchObject({ length: 20_000, placedAtY: 30_000 });
    });
    it('1 поперечный шов', () => {
      expect(r.seamCount).toBe(1);
    });
    it('warning: помещение длиннее рулона', () => {
      expect(r.warnings).toContain('Помещение длиннее рулона — потребуются поперечные доборы');
    });
  });

  describe('Сценарий 5 (план §3.7): помещение 4×30 м == рулон 4×30 м', () => {
    const room = createRoom('s5', 4, 30);
    const roll = createRoll(4, 30);
    const r = calculateOptimal(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('0 швов', () => expect(r.seamCount).toBe(0));
    it('wasteArea = 0', () => expect(r.wasteAreaMm2).toBe(0));
  });

  describe('Сценарий 6 (план §3.7): помещение 3×4 м, рулон 4×30 м', () => {
    const room = createRoom('s6', 3, 4);
    const roll = createRoll(4, 30);
    const r = calculateOptimal(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('0 швов', () => expect(r.seamCount).toBe(0));
    it('waste = roll − piece = 120M − 12M = 108M', () => {
      expect(r.wasteAreaMm2).toBe(108_000_000);
    });
  });

  describe('Граничные случаи', () => {
    it('пустое помещение → feasible=false', () => {
      const room = { id: 'empty', name: 'empty', width: 5000, length: 0 };
      const roll = createRoll(4, 30);
      const r = calculateOptimal(room, roll);
      expect(r.feasible).toBe(false);
      expect(r.rollsUsed).toBe(0);
      expect(r.warnings).toContain('Помещение не задано');
    });

    it('некорректный рулон → throw', () => {
      const room = createRoom('r', 3, 5);
      const badRoll = { id: 'bad', width: 4000, length: 0 };
      expect(() => calculateOptimal(room, badRoll)).toThrow();
    });
  });
});
