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
    it('0 швов', () => expect(r.totalSeamLengthMm).toBe(0));
    it('waste = площадь рулона − площадь покрытия', () => {
      // 4000×30000 − 3000×5000 = 120_000_000 − 15_000_000 = 105_000_000
      expect(r.wasteAreaMm2).toBe(105_000_000);
    });
  });

  describe('Сценарий 2 (план §3.7): помещение 10×6 м (width=10, length=6), рулон 4×30 м', () => {
    // План §3.7: «rollsUsed=3 (по одному на полосу 4+4+2), швы=2×10=20м».
    // Цифра «20м» в плане предполагает room.length=10м, что противоречит
    // «10×6» с шириной 10 и нашей convention. По convention (width=10,
    // length=6): 3 полосы (4000+4000+2000) длиной 6000 каждая, 2 продольных
    // границы → швы = 2 × 6000 = 12000.
    const room = createRoom('s2', 10, 6);
    const roll = createRoll(4, 30);
    const r = calculateOptimal(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('3 рулона (по одному на каждую полосу)', () => expect(r.rollsUsed).toBe(3));
    it('3 piece (по одному в полосе)', () => expect(r.pieces).toHaveLength(3));
    it('2 продольных шва × room.length = 2 × 6000 = 12 000 mm (≠ план §3.7 «20м»)', () => {
      // План использует room.length=10м (другая интерпретация ориентации).
      // Здесь length=6000 по нашей convention.
      expect(r.totalSeamLengthMm).toBe(12_000);
    });
  });

  describe('Сценарий 3 (план §3.7): помещение 50×4 м (width=4, length=50), рулон 4×30 м', () => {
    // Convention: width=4 (поперёк, == roll.width), length=50 (вдоль).
    // Одна полоса x=0 stripWidth=4000, needLen=50000.
    //   iter1: roll 0, useLen=min(30000,50000)=30000. piece(0, l=30000, y=0).
    //   iter2: roll 1, useLen=20000. piece(1, l=20000, y=30000).
    // rollsUsed=2, 1 поперечный шов = stripWidth = 4000.
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
    it('1 поперечный шов = ширина полосы = 4000 mm', () => {
      expect(r.totalSeamLengthMm).toBe(4000);
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
    it('0 швов', () => expect(r.totalSeamLengthMm).toBe(0));
    it('wasteArea = 0', () => expect(r.wasteAreaMm2).toBe(0));
  });

  describe('Сценарий 6 (план §3.7): помещение 3×4 м, рулон 4×30 м', () => {
    const room = createRoom('s6', 3, 4);
    const roll = createRoll(4, 30);
    const r = calculateOptimal(room, roll);

    it('feasible', () => expect(r.feasible).toBe(true));
    it('1 рулон', () => expect(r.rollsUsed).toBe(1));
    it('0 швов', () => expect(r.totalSeamLengthMm).toBe(0));
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
