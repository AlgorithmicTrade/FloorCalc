/**
 * OffcutBank — банк прямоугольных обрезков для экономного режима.
 *
 * После каждого реза остатки (продольный хвост рулона + боковой обрезок)
 * кладутся в банк. Для каждого нужного куска полосы — сначала ищем подходящий
 * обрезок (`findBestFor`), и только если его нет — открываем новый рулон.
 *
 * Геометрия consume: гильотинный рез — сначала по ширине (вертикальный рез),
 * потом по длине (горизонтальный рез) от оставшейся части. В банк
 * возвращаются только прямоугольники с положительной площадью.
 */

import type { Offcut } from '../types';

export class OffcutBank {
  private offcuts: Offcut[] = [];

  /** Положить обрезок в банк (только если width > 0 && length > 0). */
  add(offcut: Offcut): void {
    if (offcut.width > 0 && offcut.length > 0) {
      this.offcuts.push(offcut);
    }
  }

  /**
   * Найти лучший подходящий обрезок: width >= w && length >= l.
   * Tie-break — минимальная площадь (плотнее использовать мелкие).
   * @returns null если ни один не подходит.
   */
  findBestFor(width: number, length: number): Offcut | null {
    let best: Offcut | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const o of this.offcuts) {
      if (o.width >= width && o.length >= length) {
        const area = o.width * o.length;
        if (area < bestArea) {
          best = o;
          bestArea = area;
        }
      }
    }
    return best;
  }

  /**
   * Использовать обрезок: вырезать прямоугольник `usedWidth × usedLength`
   * из левого верхнего угла, удалить исходный обрезок из банка, добавить
   * остатки (правый и нижний прямоугольники гильотинного реза).
   *
   * Геометрия: рез сначала по ширине → правый прямоугольник с той же высотой,
   * что и использованная (`usedLength`); затем по длине → нижний прямоугольник
   * шириной во весь исходный обрезок.
   *
   * @throws Error если usedWidth/usedLength превышают исходный обрезок.
   */
  consume(offcut: Offcut, usedWidth: number, usedLength: number): void {
    if (usedWidth <= 0 || usedLength <= 0) {
      throw new Error(`OffcutBank.consume: used dims must be positive (got ${usedWidth}×${usedLength})`);
    }
    if (usedWidth > offcut.width || usedLength > offcut.length) {
      throw new Error(
        `OffcutBank.consume: used ${usedWidth}×${usedLength} exceeds offcut ${offcut.width}×${offcut.length}`
      );
    }
    const idx = this.offcuts.indexOf(offcut);
    if (idx === -1) {
      throw new Error('OffcutBank.consume: offcut not found in bank');
    }
    this.offcuts.splice(idx, 1);

    // Правый остаток (рядом с использованным куском, той же высоты).
    if (usedWidth < offcut.width) {
      this.add({
        rollIndex: offcut.rollIndex,
        sourceX: offcut.sourceX + usedWidth,
        sourceY: offcut.sourceY,
        width: offcut.width - usedWidth,
        length: usedLength
      });
    }

    // Нижний остаток (под исходным обрезком, во всю ширину обрезка).
    if (usedLength < offcut.length) {
      this.add({
        rollIndex: offcut.rollIndex,
        sourceX: offcut.sourceX,
        sourceY: offcut.sourceY + usedLength,
        width: offcut.width,
        length: offcut.length - usedLength
      });
    }
  }

  /** Суммарная площадь всех обрезков в банке, mm². */
  totalArea(): number {
    let sum = 0;
    for (const o of this.offcuts) {
      sum += o.width * o.length;
    }
    return sum;
  }

  /** Snapshot текущих обрезков (read-only копия для тестов / отчётов). */
  all(): readonly Offcut[] {
    return [...this.offcuts];
  }

  /**
   * Remap rollIndex у всех обрезков по предоставленной карте `oldIdx → newIdx`.
   * Обрезки, чьего `rollIndex` НЕТ в карте, удаляются (phantom rolls после
   * rotation post-pass — рулон открыт, но все его pieces ушли в обмен на
   * rotated piece из другого рулона).
   */
  remapAndFilterRollIndices(map: ReadonlyMap<number, number>): void {
    const next: Offcut[] = [];
    for (const o of this.offcuts) {
      const newIdx = map.get(o.rollIndex);
      if (newIdx === undefined) continue;
      next.push({ ...o, rollIndex: newIdx });
    }
    this.offcuts = next;
  }
}
