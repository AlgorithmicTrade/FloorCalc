/**
 * Тесты SchemeRenderer.renderScheme.
 *
 * Регрессия: room 9.4×21м, stage 640×360 — куски с minSide ~11px не получали
 * pieceLabel из-за старого порога w>=14 && h>=14. Новый порог: minSide >= 8.
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
const MARGIN = 40;
const STATS_BLOCK_HEIGHT = 22 * 2; // STATS_LINE_HEIGHT=22, STATS_LINES=2

function computeScale(roomWmm: number, roomLmm: number, stageW: number, stageH: number): number {
  const innerW = stageW - MARGIN * 2;
  const innerH = stageH - STATS_BLOCK_HEIGHT - MARGIN * 2;
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
    // innerW=560, innerH=236; scale=min(560/9400, 236/21000)≈0.01124
    expect(scale).toBeCloseTo(236 / 21000, 5);
    expect(scale).toBeLessThan(560 / 9400);
  });

  it('каждый piece c minSide >= 8px имеет pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labels = new Map(getLabelNodes(layout.nodes).map((l) => [l.pieceId, l]));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) >= 8) {
        expect(labels.has(p.pieceId)).toBe(true);
      }
    }
  });

  it('все pieceLabel: fontSize >= 7', () => {
    for (const l of getLabelNodes(layout.nodes)) {
      expect(l.fontSize).toBeGreaterThanOrEqual(7);
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

  it('каждый piece c minSide >= 8px имеет pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labels = new Map(getLabelNodes(layout.nodes).map((l) => [l.pieceId, l]));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) >= 8) {
        expect(labels.has(p.pieceId)).toBe(true);
      }
    }
  });

  it('все pieceLabel: fontSize >= 7', () => {
    for (const l of getLabelNodes(layout.nodes)) {
      expect(l.fontSize).toBeGreaterThanOrEqual(7);
    }
  });
});

// ── 3. Edge case: stage 200×150, pieces < 8px не получают label ──────────────

describe('renderScheme — edge case: stage 200×150, piece < 8px нет label', () => {
  // stage 200×150: innerH = 150-44-80 = 26
  // scale = min(120/9400, 26/21000) ≈ 0.00124 px/mm
  // кусок 2000mm → 2000 * 0.00124 = 2.48px → minSide < 8 → label не рисуется.
  const room = createRoom('small', 9.4, 21);
  const roll = createRoll(2, 30);
  const catalog = [roll];
  const result = calculateEconomy(room, roll);
  const layout = renderScheme(result, room, roll, catalog, 200, 150);
  const scale = computeScale(room.width, room.length, 200, 150);

  it('scale < 0.002 px/mm', () => {
    expect(scale).toBeLessThan(0.002);
  });

  it('piece с minSide < 8px не получает pieceLabel', () => {
    const pieces = getPieceNodes(layout.nodes);
    const labelIds = new Set(getLabelNodes(layout.nodes).map((l) => l.pieceId));
    for (const p of pieces) {
      if (Math.min(p.width, p.height) < 8) {
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
