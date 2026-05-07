/**
 * Тесты OffcutBank: жизненный цикл add → findBestFor → consume,
 * tie-break по площади, корректность гильотинного реза.
 */

import { describe, expect, it } from 'vitest';
import { OffcutBank } from '../../src/domain/calculator/bank';
import type { Offcut } from '../../src/domain/types';

const o = (
  rollIndex: number,
  sourceX: number,
  sourceY: number,
  width: number,
  length: number
): Offcut => ({ rollIndex, sourceX, sourceY, width, length });

describe('OffcutBank', () => {
  describe('add', () => {
    it('adds positive-area offcut', () => {
      const bank = new OffcutBank();
      bank.add(o(0, 0, 0, 1000, 2000));
      expect(bank.all()).toHaveLength(1);
      expect(bank.totalArea()).toBe(1000 * 2000);
    });

    it('ignores zero-width offcut', () => {
      const bank = new OffcutBank();
      bank.add(o(0, 0, 0, 0, 5000));
      expect(bank.all()).toHaveLength(0);
    });

    it('ignores zero-length offcut', () => {
      const bank = new OffcutBank();
      bank.add(o(0, 0, 0, 5000, 0));
      expect(bank.all()).toHaveLength(0);
    });
  });

  describe('findBestFor', () => {
    it('returns null when nothing fits', () => {
      const bank = new OffcutBank();
      bank.add(o(0, 0, 0, 1000, 2000));
      expect(bank.findBestFor(2000, 1000)).toBeNull(); // ширина не подходит
    });

    it('returns matching offcut when only one fits', () => {
      const bank = new OffcutBank();
      const a = o(0, 0, 0, 4000, 30_000);
      bank.add(a);
      const found = bank.findBestFor(3000, 5000);
      expect(found).toBe(a);
    });

    it('tie-break: choose minimum area among fitting candidates', () => {
      const bank = new OffcutBank();
      // запрос (3000, 5000); кандидаты:
      //  - 4000×5000 = 20_000_000 mm² (подходит, минимальная площадь)
      //  - 3500×6000 = 21_000_000 mm² (подходит, больше)
      //  - 2000×9000 = 18_000_000 (НЕ подходит — width<3000)
      const small = o(0, 0, 0, 4000, 5000);
      const big = o(0, 0, 0, 3500, 6000);
      const tooNarrow = o(0, 0, 0, 2000, 9000);
      bank.add(small);
      bank.add(big);
      bank.add(tooNarrow);
      const found = bank.findBestFor(3000, 5000);
      expect(found).toBe(small);
    });
  });

  describe('consume', () => {
    it('removes offcut and adds 2 remainders for partial use (right + bottom)', () => {
      const bank = new OffcutBank();
      const src = o(0, 0, 0, 4000, 30_000);
      bank.add(src);
      bank.consume(src, 3000, 5000);

      const all = bank.all();
      expect(all).toHaveLength(2);

      // Правый: (3000, 0, 1000, 5000) — высотой как использованный кусок.
      const right = all.find((x) => x.sourceX === 3000 && x.sourceY === 0);
      expect(right).toEqual({ rollIndex: 0, sourceX: 3000, sourceY: 0, width: 1000, length: 5000 });

      // Нижний: (0, 5000, 4000, 25000) — на всю ширину исходного обрезка.
      const bottom = all.find((x) => x.sourceX === 0 && x.sourceY === 5000);
      expect(bottom).toEqual({ rollIndex: 0, sourceX: 0, sourceY: 5000, width: 4000, length: 25_000 });
    });

    it('produces no remainders when used dims match offcut dims', () => {
      const bank = new OffcutBank();
      const src = o(0, 0, 0, 4000, 30_000);
      bank.add(src);
      bank.consume(src, 4000, 30_000);
      expect(bank.all()).toHaveLength(0);
      expect(bank.totalArea()).toBe(0);
    });

    it('produces only right remainder when length matches', () => {
      const bank = new OffcutBank();
      const src = o(0, 0, 0, 4000, 30_000);
      bank.add(src);
      bank.consume(src, 3000, 30_000);
      const all = bank.all();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual({ rollIndex: 0, sourceX: 3000, sourceY: 0, width: 1000, length: 30_000 });
    });

    it('produces only bottom remainder when width matches', () => {
      const bank = new OffcutBank();
      const src = o(0, 0, 0, 4000, 30_000);
      bank.add(src);
      bank.consume(src, 4000, 5000);
      const all = bank.all();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual({ rollIndex: 0, sourceX: 0, sourceY: 5000, width: 4000, length: 25_000 });
    });

    it('throws when used dims exceed offcut', () => {
      const bank = new OffcutBank();
      const src = o(0, 0, 0, 4000, 30_000);
      bank.add(src);
      expect(() => bank.consume(src, 5000, 1000)).toThrow();
    });

    it('throws when used dims are non-positive', () => {
      const bank = new OffcutBank();
      const src = o(0, 0, 0, 4000, 30_000);
      bank.add(src);
      expect(() => bank.consume(src, 0, 1000)).toThrow();
    });

    it('throws when offcut is not in bank', () => {
      const bank = new OffcutBank();
      const orphan = o(0, 0, 0, 4000, 30_000);
      expect(() => bank.consume(orphan, 1000, 1000)).toThrow();
    });
  });

  describe('totalArea', () => {
    it('sums all offcut areas', () => {
      const bank = new OffcutBank();
      bank.add(o(0, 0, 0, 1000, 2000)); // 2_000_000
      bank.add(o(1, 0, 0, 3000, 4000)); // 12_000_000
      expect(bank.totalArea()).toBe(14_000_000);
    });

    it('is zero for empty bank', () => {
      expect(new OffcutBank().totalArea()).toBe(0);
    });
  });
});
