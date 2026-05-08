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
 *
 * Под схемой — две строки статистики:
 *  1) общая: rollsUsed · seamCount · wasteAreaMm2;
 *  2) детальная: «WxL — N шт.» по каждому типоразмеру использованных рулонов.
 * Обе строки попадают в PNG/PDF/print экспорт. Warnings выводятся в HTML-tooltip
 * рядом с заголовком режима (см. ResultCard) — в схеме их нет.
 *
 * Размеры самих кусков не отображаются как подписи на схеме (по UX-решению):
 * визуально показывается только номер рулона. Детальные размеры доступны в
 * HTML-tooltip при hover (см. SchemeView.computeTooltipLines).
 */

import type { CalculationResult, Room, RollType } from '@/domain/types';
import { formatMTrim, formatAreaTrim } from '@/domain/units';

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
      /** Уникальный идентификатор куска — используется для группировки в SchemeView. */
      pieceId: string;
    }
  | { kind: 'roomLabel'; x: number; y: number; text: string; fontSize: number }
  | {
      kind: 'pieceLabel';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: number;
      /** Идентификатор куска, к которому относится подпись. */
      pieceId: string;
    }
  | {
      kind: 'statsRow';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: number;
      bold: boolean;
    }
  | {
      /** Цветной квадратик типоразмера во второй строке статистики. */
      kind: 'statsItemSwatch';
      x: number;
      y: number;
      size: number;
      fill: string;
    }
  | {
      /** Текст ячейки типоразмера во второй строке статистики. */
      kind: 'statsItemText';
      x: number;
      y: number;
      text: string;
      fontSize: number;
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

/** Цвет типоразмера рулона по его позиции в КАТАЛОГЕ (стабилен между расчётами). */
function getRollTypeColor(
  rollId: string,
  catalog: ReadonlyArray<{ id: string }>
): string {
  const idx = catalog.findIndex((r) => r.id === rollId);
  const safe = idx >= 0 ? idx : 0;
  return SCHEME_PALETTE[safe % SCHEME_PALETTE.length] ?? SCHEME_PALETTE[0]!;
}

/** Адаптивный отступ: на узких канвасах (< 480px) уменьшаем margin до 20px,
 *  чтобы больше площади отдать под схему. */
function getMargin(stageWidth: number): number {
  return stageWidth < 480 ? 20 : 40;
}

/** Размер шрифта roomLabel зависит от margin: при 20px нужен более мелкий шрифт,
 *  чтобы подпись умещалась в отступе. */
function getRoomLabelFontSize(stageWidth: number): number {
  return stageWidth < 480 ? 11 : 12;
}

const STATS_LINE_HEIGHT = 22;  // высота одной строки статистики
const STATS_LINES = 2;         // 2 строки: общая + детальная по типам
const STATS_BLOCK_HEIGHT = STATS_LINE_HEIGHT * STATS_LINES;
const DEFAULT_W = 800;
const DEFAULT_H = 600;

export function renderScheme(
  result: CalculationResult,
  room: Room,
  roll: RollType,
  catalog: readonly RollType[],
  stageWidth: number = DEFAULT_W,
  stageHeight: number = DEFAULT_H,
): SchemeLayout {
  const nodes: SchemeNode[] = [];

  // Защита от дегенеративных входов: если помещение не задано,
  // возвращаем только пустой stage без нод (UI обернёт в EmptyState).
  if (room.width <= 0 || room.length <= 0) {
    return { stageWidth, stageHeight, nodes };
  }

  const MARGIN = getMargin(stageWidth);

  // Зона схемы — весь stage за вычетом нижнего блока статистики.
  const schemeZoneH = stageHeight - STATS_BLOCK_HEIGHT;
  const innerW = stageWidth - MARGIN * 2;
  const innerH = schemeZoneH - MARGIN * 2;

  // Mapping: room.width → ось X сцены, room.length → ось Y сцены.
  const scale = Math.min(innerW / room.width, innerH / room.length);

  const roomPxW = room.width * scale;
  const roomPxH = room.length * scale;

  // Центрируем помещение в inner-области зоны схемы.
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

  // === Pieces ===
  // Цвет каждого куска — по его собственному rollTypeId (поддержка mixed-type укладки).
  // При mono-type все куски одного цвета; при mixed — каждый тип своим цветом из палитры.
  for (const p of result.pieces) {
    const x = offsetX + p.placedAtX * scale;
    const y = offsetY + p.placedAtY * scale;
    const w = p.width * scale;
    const h = p.length * scale;
    const pieceFill = getRollTypeColor(p.rollTypeId, catalog);
    // Стабильный ID куска: rollTypeId + позиция укладки.
    const pieceId = `${p.rollTypeId}-${p.placedAtX}-${p.placedAtY}`;

    nodes.push({
      kind: 'piece',
      x,
      y,
      width: w,
      height: h,
      fill: pieceFill,
      rollIndex: p.rollIndex,
      pieceId,
    });

    // Номер рулона (1-based). На схеме отображается только он —
    // размеры кусков не показываются как подписи (доступны в hover-tooltip).
    //
    // Порог 5px — минимум, при котором одиночная цифра читаема при fontSize=6
    // (одиночный digit ≈ 3.3px ширина, укладывается в 5×5 box).
    // fontSize адаптируется к min(w, h), чтобы корректно работать на кусках
    // с малой высотой (полосы 1м при scale~4px/m на мобильных) и на узких кусках.
    // Для многозначных номеров (≥10) дополнительно ограничиваем по ширине:
    //   digits * 0.55 * fontSize ≤ w - 2.
    const minSide = Math.min(w, h);
    if (minSide >= 5) {
      const digits = String(p.rollIndex + 1).length;
      // Расширенная шкала baseFs: добавлен уровень 6px для очень маленьких кусков.
      const baseFs = h < 12 ? 6 : h < 18 ? 8 : h < 30 ? 11 : h < 60 ? 14 : 18;
      // Текст должен помещаться по ширине: digits * 0.55 * fontSize ≤ w - 2.
      const maxFsByWidth = Math.floor((w - 2) / (0.55 * Math.max(1, digits)));
      // Текст должен помещаться по высоте с минимальным зазором.
      const maxFsByHeight = Math.floor(h - 2);
      const pieceLabelFontSize = Math.max(5, Math.min(baseFs, maxFsByWidth, maxFsByHeight));
      nodes.push({
        kind: 'pieceLabel',
        x,
        y,
        width: w,
        height: h,
        text: String(p.rollIndex + 1),
        fontSize: pieceLabelFontSize,
        pieceId,
      });
    }
  }

  // Размер ширины помещения (сверху по центру) и длины (слева по центру).
  const roomLabelFontSize = getRoomLabelFontSize(stageWidth);
  // При уменьшенном margin (20px) корректируем вертикальный отступ подписи ширины.
  const labelTopOffset = MARGIN >= 30 ? 22 : 14;
  nodes.push({
    kind: 'roomLabel',
    x: offsetX + roomPxW / 2 - 30,
    y: offsetY - labelTopOffset,
    text: formatMTrim(room.width),
    fontSize: roomLabelFontSize,
  });
  nodes.push({
    kind: 'roomLabel',
    x: offsetX - MARGIN + 2,
    y: offsetY + roomPxH / 2 - 8,
    text: formatMTrim(room.length),
    fontSize: roomLabelFontSize,
  });

  // === Stats: 2 строки ===
  // Строка 1 — общие метрики (один statsRow, bold).
  const summaryText =
    `Рулонов: ${result.rollsUsed}    Кусков: ${result.pieces.length} шт.    ` +
    `Обрезки: ${formatAreaTrim(result.wasteAreaMm2)}`;

  nodes.push({
    kind: 'statsRow',
    x: 0,
    y: schemeZoneH,
    width: stageWidth,
    height: STATS_LINE_HEIGHT,
    text: summaryText,
    fontSize: 13,
    bold: true,
  });

  // Строка 2 — разбивка по типоразмерам: цветной квадратик + текст для каждого типа.
  // Группировка piece по rollTypeId; счёт уникальных rollIndex = число физических
  // рулонов данного типа.
  const byType = new Map<string, Set<number>>();
  for (const p of result.pieces) {
    if (!byType.has(p.rollTypeId)) byType.set(p.rollTypeId, new Set<number>());
    byType.get(p.rollTypeId)!.add(p.rollIndex);
  }

  const DETAIL_FONT_SIZE = 12;
  const SWATCH_SIZE = 10;
  // Вертикальный центр строки 2 для выравнивания квадратика.
  const row2Y = schemeZoneH + STATS_LINE_HEIGHT;
  const swatchOffsetY = (STATS_LINE_HEIGHT - SWATCH_SIZE) / 2;
  // Приблизительная ширина символа: 0.55 * fontSize.
  const CHAR_WIDTH = DETAIL_FONT_SIZE * 0.55;
  // Зазор между квадратиком и текстом, между ячейками.
  const SWATCH_TEXT_GAP = 4;
  const CELL_GAP = 16;

  // Первый проход — вычислить суммарную ширину всех ячеек для центровки.
  type DetailCell = { rollTypeId: string; text: string };
  const detailCells: DetailCell[] = [];
  for (const [rollTypeId, indices] of byType) {
    const r = catalog.find((rt) => rt.id === rollTypeId);
    if (!r) continue;
    const text = `${formatMTrim(r.width)} × ${formatMTrim(r.length)} — ${indices.size} шт.`;
    detailCells.push({ rollTypeId, text });
  }

  if (detailCells.length > 0) {
    // Суммарная ширина: каждая ячейка = swatch + gap + текст; между ячейками — CELL_GAP.
    const totalWidth =
      detailCells.reduce(
        (sum, cell) => sum + SWATCH_SIZE + SWATCH_TEXT_GAP + cell.text.length * CHAR_WIDTH,
        0,
      ) +
      (detailCells.length - 1) * CELL_GAP;

    let curX = (stageWidth - totalWidth) / 2;

    for (const cell of detailCells) {
      const swatchFill = getRollTypeColor(cell.rollTypeId, catalog);
      nodes.push({
        kind: 'statsItemSwatch',
        x: curX,
        y: row2Y + swatchOffsetY,
        size: SWATCH_SIZE,
        fill: swatchFill,
      });
      curX += SWATCH_SIZE + SWATCH_TEXT_GAP;

      const textWidth = cell.text.length * CHAR_WIDTH;
      nodes.push({
        kind: 'statsItemText',
        x: curX,
        y: row2Y,
        text: cell.text,
        fontSize: DETAIL_FONT_SIZE,
      });
      curX += textWidth + CELL_GAP;
    }
  }

  return { stageWidth, stageHeight, nodes };
}
