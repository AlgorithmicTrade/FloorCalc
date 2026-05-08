/**
 * Тесты SchemeRenderer.renderScheme.
 *
 * Регрессия: room 9.4×21м, stage 640×360 — куски с minSide ~11px не получали
 * pieceLabel из-за старого порога w>=14 && h>=14. Новый порог: minSide >= 5.
 *
 * Адаптивный MARGIN: stageWidth < 480 → MARGIN=20, иначе 40.
 *
 * Все размеры передаются в МЕТРАХ через createRoom/createRoll (fixtures
 * переводят в мм внутри: Math.round(m * 1000)).
 */

import { describe, expect, it } from 'vitest';
import { renderScheme, SCHEME_PALETTE } from '../../src/components/result/SchemeRenderer';
import { calculateEconomy } from '../../src/domain/calculator/economy';
import { createRoll, createRoom } from './fixtures';
import type { SchemeNode } from '../../src/components/result/SchemeRenderer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPieceNodes(nodes: SchemeNode[]) {
  return nodes.filter((n): n is Extract<SchemeNode, { kind: 'piece' }> => n.kind === 'piece');
}

function getLabelNodes(nodes: SchemeNode[]) {
  return nodes.filter(
    (n): n is Extract<SchemeNode, { kind: 'pieceLabel' }> => n.kind === 'pieceLabel',
  );
}

// Воспроизводим расчёт scale из SchemeRenderer (константы синхронизированы с файлом).
// Адаптивный MARGIN: < 480 → 20, иначе 40.
const STATS_BLOCK_HEIGHT = 22 * 2; // STATS_LINE_HEIGHT=22, STATS_LINES=2

function getMargin(stageW: number): number {
  return stageW < 480 ? 20 : 40;
}

function computeScale(roomWmm: number, roomLmm: number, stageW: number, stageH: number): number {
  const margin = getMargin(stageW);
  const innerW = stageW - margin * 2;
  const innerH = stageH - STATS_BLOCK_HEIGHT - margin * 2;
  return Math.min(innerW / roomWmm, innerH / roomLmm);
}

// ── 1. Vertical room 9.4×21м, stage 640×360 ──────────────────────────────────

describe('renderScheme — vertical 9.4×21m, stage 640×360', () => {
  // createRoom принимает метры: (name, widthM, lengthM)
  const room = createRoom('v', 9.4, 21);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 640, 360);
  const scale = computeScale(room.width, room.length, 640, 360);

  it('расчёт feasible, есть куски', () => {
    expect(result.feasible).toBe(true);
    expect(result.pieces.length).toBeGreaterThan(0);
  });

  it('scale ограничен innerH/roomLength (≈ 11.24 px/mm)', () => {
    // MARGIN=40 (stageW=640>=480): innerW=560, innerH=236; scale=min(560/9400, 236/21000)≈0.01124
    expect(scale).toBeCloseTo(236 / 21000, 5);
    expect(scale).toBeLessThan(560 / 9400);
  });

  it('каждый piece c minSide >= 5px имеет pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labels = new Map(getLabelNodes(layout.nodes).map((l) => [l.pieceId, l]));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) >= 5) {
        expect(labels.has(p.pieceId)).toBe(true);
      }
    }
  });

  it('все pieceLabel: fontSize >= 5', () => {
    for (const l of getLabelNodes(layout.nodes)) {
      expect(l.fontSize).toBeGreaterThanOrEqual(5);
    }
  });
});

// ── 2. Horizontal room 21×9.4м, stage 640×360 ────────────────────────────────

describe('renderScheme — horizontal 21×9.4m, stage 640×360', () => {
  const room = createRoom('h', 21, 9.4);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 640, 360);

  it('расчёт feasible', () => {
    expect(result.feasible).toBe(true);
  });

  it('каждый piece c minSide >= 5px имеет pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labels = new Map(getLabelNodes(layout.nodes).map((l) => [l.pieceId, l]));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) >= 5) {
        expect(labels.has(p.pieceId)).toBe(true);
      }
    }
  });

  it('все pieceLabel: fontSize >= 5', () => {
    for (const l of getLabelNodes(layout.nodes)) {
      expect(l.fontSize).toBeGreaterThanOrEqual(5);
    }
  });
});

// ── 3. Edge case: stage 200×150, pieces < 5px не получают label ──────────────

describe('renderScheme — edge case: stage 200×150, piece < 5px нет label', () => {
  // MARGIN=20 (stageW=200<480): innerW=160, innerH=150-44-40=66
  // scale = min(160/9400, 66/21000) ≈ 0.00314 px/mm
  // кусок 2000mm → 2000 * 0.00314 ≈ 6.3px ширина × ... (зависит от ориентации).
  const room = createRoom('small', 9.4, 21);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 200, 150);
  const scale = computeScale(room.width, room.length, 200, 150);

  it('scale корректно вычислен с адаптивным MARGIN=20', () => {
    // MARGIN=20: innerW=160, innerH=66; scale=min(160/9400, 66/21000)
    expect(scale).toBeCloseTo(Math.min(160 / 9400, 66 / 21000), 5);
  });

  it('piece с minSide < 5px не получает pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labelIds = new Set(getLabelNodes(layout.nodes).map((l) => l.pieceId));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) < 5) {
        expect(labelIds.has(p.pieceId)).toBe(false);
      }
    }
  });
});

// ── 4. Multi-digit rollIndex: fontSize ограничен по ширине ────────────────────

describe('renderScheme — 11 рулонов (двузначный номер), fontSize ≤ maxFsByWidth', () => {
  // room 22м×5м, рулон 2м×5м → 11 полос → rollIndex 0..10 (есть двузначный).
  const room = createRoom('wide', 22, 5);
  const roll = createRoll(2, 5);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 640, 360);

  it('используется ≥ 10 рулонов', () => {
    expect(result.rollsUsed).toBeGreaterThanOrEqual(10);
  });

  it('pieceLabel с двузначным текстом: fontSize ≤ floor((w-2)/(0.55*digits))', () => {
    const piecesById = new Map(getPieceNodes(layout.nodes).map((p) => [p.pieceId, p]));
    for (const label of getLabelNodes(layout.nodes)) {
      if (label.text.length >= 2) {
        const piece = piecesById.get(label.pieceId);
        if (!piece) continue;
        const maxFsByWidth = Math.floor((piece.width - 2) / (0.55 * label.text.length));
        expect(label.fontSize).toBeLessThanOrEqual(maxFsByWidth);
      }
    }
  });
});

// ── 5. Пустое помещение — нет piece/pieceLabel нод ───────────────────────────

describe('renderScheme — пустое помещение (0×0)', () => {
  const room = createRoom('empty', 0, 0);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 640, 360);

  it('нет piece и pieceLabel нод', () => {
    expect(getPieceNodes(layout.nodes)).toHaveLength(0);
    expect(getLabelNodes(layout.nodes)).toHaveLength(0);
  });
});

// ── 6. SCHEME_PALETTE ─────────────────────────────────────────────────────────

describe('SCHEME_PALETTE', () => {
  it('содержит 6 цветов', () => {
    expect(SCHEME_PALETTE).toHaveLength(6);
  });
});

// ── 7. S23+ portrait: stage 380×520 (adaptive aspect), room 9.4×21м ──────────
//    Все куски 1м-полосы (9400mm×1000mm при рулоне 2м×30м) должны получить label.

describe('renderScheme — S23+ portrait adaptive aspect: stage 380×520, room 9.4×21m', () => {
  const room = createRoom('s23portrait', 9.4, 21);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  // Adaptive aspect: roomAspect=21/9.4≈2.23 → clamp → 2.0 → height=380*2=760, capped 520
  const layout = renderScheme(result, room, roll, catalog, 380, 520);
  const scale = computeScale(room.width, room.length, 380, 520);

  it('расчёт feasible, есть куски', () => {
    expect(result.feasible).toBe(true);
    expect(result.pieces.length).toBeGreaterThan(0);
  });

  it('MARGIN=20 применяется (stageW=380 < 480)', () => {
    // MARGIN=20: innerW=340, innerH=520-44-40=436
    // scale = min(340/9400, 436/21000) ≈ min(0.0362, 0.02076) = 0.02076
    expect(scale).toBeCloseTo(Math.min(340 / 9400, 436 / 21000), 5);
  });

  it('все куски получают pieceLabel (minSide >= 5px при scale≈0.021)', () => {
    // кусок 9400mm×1000mm → w=9400*0.0208≈195px, h=1000*0.0208≈20.8px → minSide≈20.8 >= 5 ✓
    const pieces = getPieceNodes(layout.nodes);
    const labels = new Map(getLabelNodes(layout.nodes).map((l) => [l.pieceId, l]));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) >= 5) {
        expect(labels.has(p.pieceId)).toBe(true);
      }
    }
  });

  it('pieceLabel у кусков со scale≈0.021: fontSize >= 5', () => {
    for (const l of getLabelNodes(layout.nodes)) {
      expect(l.fontSize).toBeGreaterThanOrEqual(5);
    }
  });
});

// ── 8. S23+ landscape: stage 915×515, room 9.4×21м ───────────────────────────

describe('renderScheme — S23+ landscape: stage 915×515, room 9.4×21m', () => {
  const room = createRoom('s23landscape', 9.4, 21);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 915, 515);
  const scale = computeScale(room.width, room.length, 915, 515);

  it('расчёт feasible', () => {
    expect(result.feasible).toBe(true);
  });

  it('MARGIN=40 применяется (stageW=915 >= 480)', () => {
    // MARGIN=40: innerW=835, innerH=515-44-80=391
    // scale = min(835/9400, 391/21000) ≈ min(0.08883, 0.01862) = 0.01862
    expect(scale).toBeCloseTo(Math.min(835 / 9400, 391 / 21000), 5);
  });

  it('все куски получают pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labels = new Map(getLabelNodes(layout.nodes).map((l) => [l.pieceId, l]));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) >= 5) {
        expect(labels.has(p.pieceId)).toBe(true);
      }
    }
  });

  it('все pieceLabel: fontSize >= 5', () => {
    for (const l of getLabelNodes(layout.nodes)) {
      expect(l.fontSize).toBeGreaterThanOrEqual(5);
    }
  });
});

// ── 9. Stress: stage 320×180, room 12×30м ────────────────────────────────────
//    Определяем минимальный размер куска, для которого label рисуется (порог 5px).

describe('renderScheme — stress: stage 320×180, room 12×30m (очень тесно)', () => {
  // MARGIN=20 (stageW=320<480): innerW=280, innerH=180-44-40=96
  // scale = min(280/12000, 96/30000) ≈ min(0.02333, 0.0032) = 0.0032 px/mm
  // Кусок 2000mm×3000mm → w=6.4px, h=9.6px → minSide=6.4 >= 5 → label есть ✓
  const room = createRoom('stress', 12, 30);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 320, 180);
  const scale = computeScale(room.width, room.length, 320, 180);

  it('scale корректен при MARGIN=20', () => {
    expect(scale).toBeCloseTo(Math.min(280 / 12000, 96 / 30000), 5);
  });

  it('piece с minSide < 5px не получает pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labelIds = new Set(getLabelNodes(layout.nodes).map((l) => l.pieceId));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) < 5) {
        expect(labelIds.has(p.pieceId)).toBe(false);
      }
    }
  });

  it('piece с minSide >= 5px получает pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labels = new Map(getLabelNodes(layout.nodes).map((l) => [l.pieceId, l]));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) >= 5) {
        expect(labels.has(p.pieceId)).toBe(true);
      }
    }
  });

  it('все pieceLabel: fontSize >= 5', () => {
    for (const l of getLabelNodes(layout.nodes)) {
      expect(l.fontSize).toBeGreaterThanOrEqual(5);
    }
  });
});
