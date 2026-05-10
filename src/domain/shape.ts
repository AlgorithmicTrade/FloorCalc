/**
 * Утилиты работы с RoomShape (свободная ортогональная планировка).
 *
 * Содержит pure-функции:
 *  - GRID_MAX / создание Wall.
 *  - Валидация замкнутости и ортогональности контура.
 *  - Вычисление polygon вершин (real-mm координат) из последовательности стен.
 *  - Вычисление bounding box (width × length) из shape.
 *  - Геометрические утилиты: hit-testing точки в polygon, ortho-segment direction.
 *
 * Все размеры — integer mm (как и весь domain-слой).
 */

import type { GridPoint, RoomShape, Wall } from './types';

/** Максимальный индекс точки сетки. Для сетки 5×5 точек = 4 (точки 0..4). */
export const GRID_MAX = 4;

/** Топологическая координата точки сетки в формате `col,row` для Map/Set ключей. */
export const pointKey = (p: GridPoint): string => `${p.col},${p.row}`;

/** Проверка эквивалентности двух точек сетки. */
export const samePoint = (a: GridPoint, b: GridPoint): boolean =>
  a.col === b.col && a.row === b.row;

/** Manhattan-расстояние между точками сетки. */
export const manhattan = (a: GridPoint, b: GridPoint): number =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

/** Точка валидна если она в пределах сетки 0..GRID_MAX по обеим осям. */
export const isPointInGrid = (p: GridPoint): boolean =>
  p.col >= 0 && p.col <= GRID_MAX && p.row >= 0 && p.row <= GRID_MAX;

/** Направление ортогонального сегмента. */
export type WallDirection = 'horizontal' | 'vertical';

/**
 * Возвращает направление стены, или null если стена не ортогональна
 * (диагональная) либо вырожденная (from == to).
 *
 * Ортогональная стена проходит ровно через одну ось: либо dRow=0 (горизонт.),
 * либо dCol=0 (вертик.). Длина стены в клетках сетки = max(|dCol|,|dRow|);
 * это не валидируется здесь — проверяется в `areCollinearOrtho` на UI-уровне.
 */
export function wallDirection(wall: Wall): WallDirection | null {
  const dCol = wall.to.col - wall.from.col;
  const dRow = wall.to.row - wall.from.row;
  // Вырожденная стена (та же точка) — не ортогональна по смыслу.
  if (dCol === 0 && dRow === 0) return null;
  // Диагональ — оба delta ненулевые.
  if (dCol !== 0 && dRow !== 0) return null;
  return dRow === 0 ? 'horizontal' : 'vertical';
}

/**
 * Проверка: пара точек на одной горизонтали или вертикали (collinear), оба
 * в пределах сетки, и точки не совпадают. Допускает любую длину сегмента
 * (Manhattan ≥ 1) — UI разрешает «провести стену через несколько точек сетки
 * одним сегментом», что критично для UX (иначе пользователь должен кликать
 * каждую точку отдельно и заводить отдельный размер на каждый шаг).
 */
export function areCollinearOrtho(a: GridPoint, b: GridPoint): boolean {
  if (!isPointInGrid(a) || !isPointInGrid(b)) return false;
  if (samePoint(a, b)) return false;
  return a.col === b.col || a.row === b.row;
}

/** Создание стены без размера (lengthMm=null). */
export function makeWall(from: GridPoint, to: GridPoint): Wall {
  return { from, to, lengthMm: null };
}

/**
 * Результат валидации shape.
 *
 * - `closed`: контур полностью замкнут (последняя стена возвращается в стартовую).
 * - `allSized`: у всех стен задан положительный lengthMm.
 * - `orthogonal`: все стены ортогональны и Manhattan=1.
 * - `consistent`: суммы lengthMm согласованы (горизонтальные слева→направо ==
 *    справа→налево; то же для вертикалей).
 * - `complete`: closed && allSized && orthogonal && consistent.
 */
export interface ShapeValidation {
  closed: boolean;
  allSized: boolean;
  orthogonal: boolean;
  consistent: boolean;
  complete: boolean;
  /** Человекочитаемые сообщения об ошибках для UI. */
  issues: string[];
}

/**
 * Полная валидация shape для готовности к расчёту.
 *
 * Replicate каждый контракт из RoomShape jsdoc и заполняет issues для UI.
 */
export function validateShape(shape: RoomShape): ShapeValidation {
  const issues: string[] = [];
  const walls = shape.walls;

  // Минимум 4 стены для замкнутого ортогонального контура.
  if (walls.length < 4) {
    return {
      closed: false,
      allSized: false,
      orthogonal: false,
      consistent: false,
      complete: false,
      issues: ['Контур не замкнут: нужно минимум 4 стены'],
    };
  }

  // Ортогональность — каждая стена с Manhattan=1.
  let orthogonal = true;
  for (const w of walls) {
    if (wallDirection(w) === null) {
      orthogonal = false;
      issues.push('Найдена не-ортогональная стена');
      break;
    }
  }

  // Цепочка соединений: walls[i].to == walls[i+1].from, последняя возвращается в первую.
  let closed = orthogonal;
  if (orthogonal) {
    for (let i = 0; i < walls.length - 1; i++) {
      if (!samePoint(walls[i]!.to, walls[i + 1]!.from)) {
        closed = false;
        issues.push('Стены не образуют непрерывную цепочку');
        break;
      }
    }
    if (closed && !samePoint(walls[walls.length - 1]!.to, walls[0]!.from)) {
      closed = false;
      issues.push('Контур не замкнут: последняя стена не возвращается в начало');
    }
  }

  // Размеры заданы у всех стен.
  let allSized = true;
  for (const w of walls) {
    if (w.lengthMm === null || w.lengthMm <= 0) {
      allSized = false;
      break;
    }
  }
  if (!allSized) {
    issues.push('Не у всех стен задан размер');
  }

  // Согласованность размеров: ∑ горизонтали(вправо) = ∑ горизонтали(влево);
  // ∑ вертикали(вниз) = ∑ вертикали(вверх).
  let consistent = false;
  if (orthogonal && allSized && closed) {
    let hRight = 0;
    let hLeft = 0;
    let vDown = 0;
    let vUp = 0;
    for (const w of walls) {
      const len = w.lengthMm!;
      const dCol = w.to.col - w.from.col;
      const dRow = w.to.row - w.from.row;
      if (dCol > 0) hRight += len;
      else if (dCol < 0) hLeft += len;
      else if (dRow > 0) vDown += len;
      else if (dRow < 0) vUp += len;
    }
    consistent = hRight === hLeft && vDown === vUp;
    if (!consistent) {
      issues.push('Размеры стен не согласованы: суммы противоположных стен должны совпадать');
    }
  }

  const complete = closed && allSized && orthogonal && consistent;
  return { closed, allSized, orthogonal, consistent, complete, issues };
}

/**
 * Polygon в координатах real-mm (origin = bbox top-left, ось Y растёт вниз).
 */
export interface ShapePolygon {
  /** Вершины polygon в порядке обхода. Длина = walls.length. */
  vertices: { x: number; y: number }[];
  /** Bounding box ширина в mm. */
  bboxWidth: number;
  /** Bounding box длина (высота) в mm. */
  bboxLength: number;
}

/**
 * Восстанавливает реальный polygon (real-mm координаты) из shape.
 *
 * Walk-алгоритм: стартуем из (0,0), идём по каждой стене смещая текущую точку
 * на (±lengthMm,0) или (0,±lengthMm) в зависимости от topological direction.
 * После прохода нормализуем — сдвигаем все вершины так, чтобы min(x)=0, min(y)=0.
 *
 * Возвращает null если shape не прошёл validateShape (.complete = false).
 */
export function buildShapePolygon(shape: RoomShape): ShapePolygon | null {
  const v = validateShape(shape);
  if (!v.complete) return null;

  const walls = shape.walls;
  const vertices: { x: number; y: number }[] = [];
  let cx = 0;
  let cy = 0;
  vertices.push({ x: cx, y: cy });

  // Обходим стены 0..N-2; последняя стена замыкает в первую вершину (не дублируем).
  for (let i = 0; i < walls.length - 1; i++) {
    const w = walls[i]!;
    const len = w.lengthMm!;
    const dCol = w.to.col - w.from.col;
    const dRow = w.to.row - w.from.row;
    if (dCol > 0) cx += len;
    else if (dCol < 0) cx -= len;
    else if (dRow > 0) cy += len;
    else if (dRow < 0) cy -= len;
    vertices.push({ x: cx, y: cy });
  }

  // Нормализация — сдвиг к origin (0,0).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of vertices) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  for (const p of vertices) {
    p.x -= minX;
    p.y -= minY;
  }

  return {
    vertices,
    bboxWidth: maxX - minX,
    bboxLength: maxY - minY,
  };
}

/**
 * Hit-test: точка (x,y) в real-mm координатах внутри polygon (ray-casting).
 *
 * Используется в SchemeRenderer для определения, какая часть piece попадает
 * вне полигона (waste from clipping). Стандартный алгоритм even-odd.
 */
export function isPointInPolygon(
  x: number,
  y: number,
  polygon: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Считает площадь polygon (Shoelace formula). Возвращает абсолютное значение в mm².
 */
export function polygonAreaMm2(polygon: readonly { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j]!.x + polygon[i]!.x) * (polygon[j]!.y - polygon[i]!.y);
  }
  return Math.abs(area) / 2;
}

/**
 * Декомпозиция bbox-rectangle на максимальные ortho-rectangles внутри ortho-polygon.
 *
 * Алгоритм (валиден ТОЛЬКО для ortho-polygon — у нас гарантировано контрактом RoomShape):
 *  1. xs = unique sorted x-координаты [rect.x0, rect.x1, polygon.vertices.x] ∩ [rect.x0, rect.x1]
 *  2. ys = unique sorted y-координаты [rect.y0, rect.y1, polygon.vertices.y] ∩ [rect.y0, rect.y1]
 *  3. Для каждой ячейки сетки (xs[i]..xs[i+1]) × (ys[j]..ys[j+1]) проверить center внутри polygon.
 *  4. Greedy-merge соседних inside-ячеек в максимальные строки (по X), затем merge соседних
 *     строк-ректанглов одинаковой ширины (по Y) — даёт компактную декомпозицию (обычно
 *     1-2 ректангла на типичных формах: L-, П-, ступенька).
 *
 * Используется в SchemeRenderer для разбиения piece (bbox-rectangle) на видимые
 * части после клипа по форме помещения — позволяет рисовать pieceLabel в каждой
 * видимой части отдельно и показывать корректный размер в tooltip.
 *
 * @param rect      ortho-rectangle во ВНЕШНИХ координатах (real-mm origin = polygon.bbox top-left).
 * @param polygon   ortho-polygon в тех же координатах (вершины из buildShapePolygon).
 * @returns массив видимых ortho-rectangles, отсортированный (top-left first). Пустой если
 *          rect полностью вне polygon. При polygon.length < 3 — возвращает [rect] (защита).
 */
export function clipRectByOrthoPolygon(
  rect: { x: number; y: number; width: number; height: number },
  polygon: readonly { x: number; y: number }[],
): Array<{ x: number; y: number; width: number; height: number }> {
  // Защита: вырожденный rect — нет видимых частей.
  if (rect.width <= 0 || rect.height <= 0) return [];
  // Защита: некорректный polygon (< 3 вершин) — отдаём rect без обрезки.
  if (polygon.length < 3) return [{ ...rect }];

  const x0 = rect.x;
  const x1 = rect.x + rect.width;
  const y0 = rect.y;
  const y1 = rect.y + rect.height;

  // Bounding box polygon — быстрый отсев полностью внешних ректанглов.
  let pMinX = Infinity;
  let pMinY = Infinity;
  let pMaxX = -Infinity;
  let pMaxY = -Infinity;
  for (const v of polygon) {
    if (v.x < pMinX) pMinX = v.x;
    if (v.x > pMaxX) pMaxX = v.x;
    if (v.y < pMinY) pMinY = v.y;
    if (v.y > pMaxY) pMaxY = v.y;
  }
  if (x1 <= pMinX || x0 >= pMaxX || y1 <= pMinY || y0 >= pMaxY) return [];

  // 1. Собираем уникальные отсортированные x/y координаты в диапазоне rect.
  const collectAxis = (
    boundLo: number,
    boundHi: number,
    extras: number[],
  ): number[] => {
    const set = new Set<number>();
    set.add(boundLo);
    set.add(boundHi);
    for (const v of extras) {
      if (v > boundLo && v < boundHi) set.add(v);
    }
    return Array.from(set).sort((a, b) => a - b);
  };

  const polyXs: number[] = [];
  const polyYs: number[] = [];
  for (const v of polygon) {
    polyXs.push(v.x);
    polyYs.push(v.y);
  }
  const xs = collectAxis(x0, x1, polyXs);
  const ys = collectAxis(y0, y1, polyYs);

  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols <= 0 || rows <= 0) return [];

  // 2. Для каждой ячейки определяем, лежит ли её центр внутри polygon.
  // Сетка inside[row][col] — ряды по Y, колонки по X.
  const inside: boolean[][] = [];
  for (let j = 0; j < rows; j++) {
    const row: boolean[] = [];
    const cy = (ys[j]! + ys[j + 1]!) / 2;
    for (let i = 0; i < cols; i++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      row.push(isPointInPolygon(cx, cy, polygon));
    }
    inside.push(row);
  }

  // 3. Greedy-merge внутри каждой строки: сегменты подряд idущих inside-ячеек.
  // Каждая строка j → массив { startCol, endColExclusive }.
  type RowSeg = { startCol: number; endCol: number };
  const rowSegs: RowSeg[][] = [];
  for (let j = 0; j < rows; j++) {
    const segs: RowSeg[] = [];
    let i = 0;
    while (i < cols) {
      if (!inside[j]![i]) {
        i++;
        continue;
      }
      const start = i;
      while (i < cols && inside[j]![i]) i++;
      segs.push({ startCol: start, endCol: i });
    }
    rowSegs.push(segs);
  }

  // 4. Merge соседних строк: если в строке j+1 есть сегмент с теми же
  // startCol/endCol, что в текущей открытой полосе — расширяем её по Y.
  // Для простоты и корректности используем «привязку» каждого сегмента к
  // максимально длинной полосе из строк, начиная с первой непокрытой.
  // Маркируем segments как используемые, чтобы не дублировать.
  const used: boolean[][] = rowSegs.map((segs) => segs.map(() => false));
  const result: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (let j = 0; j < rows; j++) {
    for (let k = 0; k < rowSegs[j]!.length; k++) {
      if (used[j]![k]) continue;
      const seg = rowSegs[j]![k]!;
      used[j]![k] = true;
      // Пытаемся «нарастить» полосу вниз: следующая строка должна содержать
      // ровно такой же сегмент { startCol, endCol } — только тогда merge безопасен.
      let endRow = j + 1;
      while (endRow < rows) {
        let nextIdx = -1;
        for (let m = 0; m < rowSegs[endRow]!.length; m++) {
          const s = rowSegs[endRow]![m]!;
          if (!used[endRow]![m] && s.startCol === seg.startCol && s.endCol === seg.endCol) {
            nextIdx = m;
            break;
          }
        }
        if (nextIdx < 0) break;
        used[endRow]![nextIdx] = true;
        endRow++;
      }
      const rx = xs[seg.startCol]!;
      const ry = ys[j]!;
      const rxEnd = xs[seg.endCol]!;
      const ryEnd = ys[endRow]!;
      result.push({ x: rx, y: ry, width: rxEnd - rx, height: ryEnd - ry });
    }
  }

  // Сортировка top-left first (по y, затем по x) — детерминированный порядок.
  result.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return result;
}

/**
 * Подсчёт «физических» сегментов раскроя для свободной формы.
 *
 * Calculator работает по bbox и выдаёт `pieces` без учёта формы — например,
 * для П-комнаты с вырезом полоса 2×12, проходящая сквозь вырез, остаётся
 * одним domain-piece, но физически (после `clipRectByOrthoPolygon`) разделяется
 * на 2 ortho-rectangles. Эта функция считает суммарное число visible-rectangles —
 * то, сколько кусков физически уляжется в комнате.
 *
 * - polygon === null или < 3 вершин → возвращает `pieces.length` (без обрезки).
 * - Иначе суммирует `clipRectByOrthoPolygon(...).length` по каждому piece.
 *
 * Используется для UI-сводки (Кусков: N) и текстового снимка — domain число
 * (`pieces.length`) не отражает физическую реальность для сложных форм.
 */
export function countVisibleSegments(
  pieces: ReadonlyArray<{
    placedAtX: number;
    placedAtY: number;
    width: number;
    length: number;
  }>,
  polygon: readonly { x: number; y: number }[] | null,
): number {
  if (polygon === null || polygon.length < 3) return pieces.length;
  let total = 0;
  for (const p of pieces) {
    const parts = clipRectByOrthoPolygon(
      { x: p.placedAtX, y: p.placedAtY, width: p.width, height: p.length },
      polygon,
    );
    total += parts.length;
  }
  return total;
}
