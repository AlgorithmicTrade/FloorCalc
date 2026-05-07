/**
 * Pure-функция рендеринга схемы: преобразует CalculationResult в массив
 * нод (`SchemeNode[]`) для последующей отрисовки в Konva.
 *
 * Координатная система Konva — пикселы, top-left origin. Помещение
 * масштабируется через единый `scale = min(stageInnerW/room.width, stageInnerH/room.length)`,
 * чтобы сохранить пропорции и поместиться целиком в сцену с margin для подписей.
 *
 * Палитра scheme-roll-* живёт в tokens.css как CSS-переменные, но Konva
 * читает только литеральные строки — поэтому palette продублирована тут.
 */

import type { CalculationResult, Room } from '@/domain/types';
import { formatM } from '@/domain/units';

export type SchemeNode =
  | { kind: 'roomFrame'; x: number; y: number; width: number; height: number }
  | {
      kind: 'piece';
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      rollIndex: number;
    }
  | { kind: 'roomLabel'; x: number; y: number; text: string }
  | {
      kind: 'pieceLabel';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
    };

export interface SchemeLayout {
  stageWidth: number;
  stageHeight: number;
  nodes: SchemeNode[];
}

/** Палитра — синхронизирована с `--scheme-roll-1..6` в tokens.css. */
export const SCHEME_PALETTE = [
  '#14c6cb',
  '#ffcf25',
  '#7b42bc',
  '#00ca8e',
  '#f24c53',
  '#1868f2',
] as const;

const MARGIN = 40;             // отступ для размерных подписей со всех сторон
const DEFAULT_W = 800;
const DEFAULT_H = 600;

/** Короткое форматирование числа в метрах без « м» (для подписей внутри схемы). */
function shortM(mm: number): string {
  return (mm / 1000).toFixed(2);
}

export function renderScheme(
  result: CalculationResult,
  room: Room,
  stageWidth: number = DEFAULT_W,
  stageHeight: number = DEFAULT_H,
): SchemeLayout {
  const nodes: SchemeNode[] = [];

  // Защита от дегенеративных входов: если помещение не задано,
  // возвращаем только пустой stage без нод (UI обернёт в EmptyState).
  if (room.width <= 0 || room.length <= 0) {
    return { stageWidth, stageHeight, nodes };
  }

  const innerW = stageWidth - MARGIN * 2;
  const innerH = stageHeight - MARGIN * 2;

  // Mapping: room.width → ось X сцены, room.length → ось Y сцены.
  // Так схема рисуется так же, как пользователь видит план помещения сверху.
  const scale = Math.min(innerW / room.width, innerH / room.length);

  const roomPxW = room.width * scale;
  const roomPxH = room.length * scale;

  // Центрируем помещение в inner-области сцены.
  const offsetX = MARGIN + (innerW - roomPxW) / 2;
  const offsetY = MARGIN + (innerH - roomPxH) / 2;

  // Frame — сначала, чтобы куски рисовались поверх и видны были границы.
  nodes.push({
    kind: 'roomFrame',
    x: offsetX,
    y: offsetY,
    width: roomPxW,
    height: roomPxH,
  });

  // Pieces — каждый кусок, цвет по rollIndex (один цвет = один рулон).
  for (const p of result.pieces) {
    const x = offsetX + p.placedAtX * scale;
    const y = offsetY + p.placedAtY * scale;
    const w = p.width * scale;
    const h = p.length * scale;
    const fill = SCHEME_PALETTE[p.rollIndex % SCHEME_PALETTE.length] ?? SCHEME_PALETTE[0]!;

    nodes.push({
      kind: 'piece',
      x,
      y,
      width: w,
      height: h,
      fill,
      rollIndex: p.rollIndex,
    });

    // Подпись внутри куска — только если он достаточно крупный, чтобы текст помещался.
    if (w >= 60 && h >= 24) {
      nodes.push({
        kind: 'pieceLabel',
        x,
        y,
        width: w,
        height: h,
        text: `${shortM(p.width)} × ${shortM(p.length)}`,
      });
    }
  }

  // Размер ширины (сверху по центру) и длины (слева по центру).
  nodes.push({
    kind: 'roomLabel',
    x: offsetX + roomPxW / 2 - 30,
    y: offsetY - 22,
    text: formatM(room.width),
  });
  nodes.push({
    kind: 'roomLabel',
    x: offsetX - 36,
    y: offsetY + roomPxH / 2 - 8,
    text: formatM(room.length),
  });

  return { stageWidth, stageHeight, nodes };
}
