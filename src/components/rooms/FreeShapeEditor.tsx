/**
 * Редактор свободной (ортогональной) планировки помещения.
 *
 * Контракт UX:
 *  - Сетка 5×5 точек (GRID_MAX+1 по каждой оси). Только горизонтальные и
 *    вертикальные стены между соседними точками.
 *  - Клик 1: выбор активной точки (head цепочки). Клик 2 по соседней
 *    ортогональной точке: добавление стены. Диагонали и self-click игнорируются.
 *  - Контур замыкается, когда последняя стена возвращается в стартовую точку
 *    первой стены — после этого активная точка очищается, можно вводить размеры.
 *  - Размеры стен (lengthMm) задаются inline через локальный WallSizeInput
 *    поверх SVG (компактный текстовый input без spinner-стрелок).
 *  - Превью «резинка»: при активной точке от неё к snapped-курсору рисуется
 *    пунктирная линия (только если ortho-collinear). На touch скрыто.
 *  - При замкнутом контуре — заливка polygon и скрытие внутренних точек сетки.
 *
 * Хранение: shape живёт в roomsStore (in-memory). Локальный state — только
 * activeStart (UI cursor цепочки) и cursorPos (для preview-линии).
 */

import {
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type FocusEvent,
  type PointerEvent,
} from 'react';
import { Card } from '@/components/design-system/Card';
import { IconButton } from '@/components/design-system/IconButton';
import { useRoomsStore } from '@/store/roomsStore';
import {
  GRID_MAX,
  areCollinearOrtho,
  isPointInPolygon,
  makeWall,
  samePoint,
  validateShape,
  wallDirection,
} from '@/domain/shape';
import type { GridPoint, RoomShape, Wall } from '@/domain/types';
import { formatMTrim } from '@/domain/units';
import { DIMENSION_MAX_MM, DIMENSION_MIN_MM } from '@shared/constants';
import styles from './FreeShapeEditor.module.css';

export interface FreeShapeEditorProps {
  roomId: string;
  /** undefined = пустой холст. */
  shape: RoomShape | undefined;
}

/** ViewBox SVG: логические единицы 0..100. Padding 10 даёт зазор для overlay-форм. */
const VIEW_BOX = 100;
const VIEW_PADDING = 10;
const STEP = (VIEW_BOX - VIEW_PADDING * 2) / GRID_MAX;

/** AABB размеры overlay-формы в SVG-units (~64px width, ~22px height при 360px фрейме). */
const FORM_W = 18;
const FORM_H = 8;

/** Циклические смещения t∈[0..1] для baseline-позиции формы вдоль стены — снижают коллизии до resolver. */
const FORM_T_PATTERN: readonly number[] = [0.5, 0.65, 0.4, 0.75];

/** Перевод точки сетки в координаты SVG (логические единицы 0..100). */
function gridToSvg(p: GridPoint): { x: number; y: number } {
  return {
    x: VIEW_PADDING + p.col * STEP,
    y: VIEW_PADDING + p.row * STEP,
  };
}

/** Snap клика по SVG к ближайшей точке сетки; null если вне сетки. */
function snapToGrid(svgX: number, svgY: number): GridPoint | null {
  const col = Math.round((svgX - VIEW_PADDING) / STEP);
  const row = Math.round((svgY - VIEW_PADDING) / STEP);
  if (col < 0 || col > GRID_MAX || row < 0 || row > GRID_MAX) return null;
  return { col, row };
}

/** Восстановление активной «головы» цепочки из shape:
 *  замкнутый контур → null; иначе to последней стены. */
function deriveActiveStart(shape: RoomShape | undefined): GridPoint | null {
  if (!shape || shape.walls.length === 0) return null;
  const v = validateShape(shape);
  if (v.closed) return null;
  const last = shape.walls[shape.walls.length - 1];
  return last ? last.to : null;
}

/** Расстояние от точки (px,py) до отрезка (a→b) в SVG-единицах. */
function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = px - ax;
    const ddy = py - ay;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  // Параметризация: t∈[0,1] вдоль отрезка.
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

/** Текст в метрах без trailing zeros: 2.5 → "2.5", 2 → "2", 2.50 → "2.5". */
function mmToCleanText(mm: number): string {
  if (mm <= 0) return '';
  // Округляем до миллиметра (3 знака после точки в м), убираем хвостовые нули.
  return (mm / 1000).toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Локальный inline-input для длины стены. Компактный текстовый input без
 * spinner-стрелок. Конвертирует м↔мм, clamp в [minMm,maxMm], откат при NaN.
 * Enter — commit (blur), Escape — откат к текущему valueMm.
 */
interface WallSizeInputProps {
  valueMm: number;
  onChangeMm: (mm: number) => void;
  minMm: number;
  maxMm: number;
  ariaLabel: string;
  onFocusChange?: (focused: boolean) => void;
}

function WallSizeInput({
  valueMm,
  onChangeMm,
  minMm,
  maxMm,
  ariaLabel,
  onFocusChange,
}: WallSizeInputProps) {
  const [text, setText] = useState<string>(() => mmToCleanText(valueMm));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Внешнее обновление valueMm (например, undo) → синхронизируем текст,
  // но только если поле сейчас не в фокусе (иначе мешало бы вводу).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(mmToCleanText(valueMm));
    }
  }, [valueMm]);

  const commit = useCallback(() => {
    const trimmed = text.trim().replace(',', '.');
    const parsed = parseFloat(trimmed);
    let mm: number;
    if (!Number.isFinite(parsed)) {
      mm = valueMm;
    } else {
      mm = Math.round(parsed * 1000);
      if (mm < minMm) mm = minMm;
      if (mm > maxMm) mm = maxMm;
    }
    setText(mmToCleanText(mm));
    if (mm !== valueMm) onChangeMm(mm);
  }, [text, valueMm, minMm, maxMm, onChangeMm]);

  const handleBlur = useCallback(
    (_e: FocusEvent<HTMLInputElement>) => {
      commit();
      onFocusChange?.(false);
    },
    [commit, onFocusChange],
  );

  const handleFocus = useCallback(
    (_e: FocusEvent<HTMLInputElement>) => {
      onFocusChange?.(true);
    },
    [onFocusChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Откат — восстановить текст из valueMm и снять фокус.
        setText(mmToCleanText(valueMm));
        inputRef.current?.blur();
      }
    },
    [valueMm],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={styles.wallSizeInput}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

/**
 * Суммы длин стен по 4 ortho-направлениям (mm).
 * Для замкнутого ortho-полигона hRight==hLeft и vDown==vUp; неравенство —
 * признак того, что суммы противоположных стен не сходятся.
 */
function computeWallSums(walls: readonly Wall[]): {
  hRight: number;
  hLeft: number;
  vDown: number;
  vUp: number;
} {
  let hRight = 0;
  let hLeft = 0;
  let vDown = 0;
  let vUp = 0;
  for (const w of walls) {
    const len = w.lengthMm ?? 0;
    if (len <= 0) continue;
    const dCol = w.to.col - w.from.col;
    const dRow = w.to.row - w.from.row;
    if (dCol > 0) hRight += len;
    else if (dCol < 0) hLeft += len;
    else if (dRow > 0) vDown += len;
    else if (dRow < 0) vUp += len;
  }
  return { hRight, hLeft, vDown, vUp };
}

/** Signed area полигона (Shoelace). Знак указывает ориентацию обхода. */
function signedAreaSvg(points: readonly { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    s += (points[j]!.x + points[i]!.x) * (points[j]!.y - points[i]!.y);
  }
  return s / 2;
}

export function FreeShapeEditor({ roomId, shape }: FreeShapeEditorProps) {
  const setRoomShape = useRoomsStore((s) => s.setRoomShape);

  // activeStart — локально, иначе при ре-рендере shape пришлось бы каждый раз
  // пересчитывать; useState с инициализатором даёт корректное восстановление.
  const [activeStart, setActiveStart] = useState<GridPoint | null>(() =>
    deriveActiveStart(shape),
  );

  // cursorPos — позиция курсора, snapped к ближайшей точке сетки. Нужно для
  // preview-линии «резинки» от активной точки.
  const [cursorPos, setCursorPos] = useState<GridPoint | null>(null);

  // Индекс стены, форма размера которой сейчас в фокусе — для подсветки.
  const [focusedWallIdx, setFocusedWallIdx] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const walls: Wall[] = shape?.walls ?? [];
  const validation = useMemo(() => (shape ? validateShape(shape) : null), [shape]);
  const isClosed = validation?.closed ?? false;

  // Точки сетки — заранее вычисленный 5×5 массив для рендера.
  const gridPoints = useMemo<GridPoint[]>(() => {
    const pts: GridPoint[] = [];
    for (let row = 0; row <= GRID_MAX; row++) {
      for (let col = 0; col <= GRID_MAX; col++) {
        pts.push({ col, row });
      }
    }
    return pts;
  }, []);

  // Топологический полигон в SVG-координатах: вершины = walls[i].from при замкнутом контуре.
  // Используем именно топологические координаты (а не реальные mm), потому что
  // у недосозданного контура размеры могут быть null. Для замкнутого контура
  // walls[i].from формируют корректную последовательность вершин.
  const polygonSvg = useMemo<{ x: number; y: number }[] | null>(() => {
    if (!isClosed || walls.length < 4) return null;
    return walls.map((w) => gridToSvg(w.from));
  }, [isClosed, walls]);

  // Для скрытия внутренних точек сетки.
  const isPointHidden = useCallback(
    (p: GridPoint): boolean => {
      if (!polygonSvg) return false;
      const c = gridToSvg(p);
      // Точки на границе (вершина или на отрезке стены) — оставляем видимыми.
      const TOL = 0.5; // SVG-единицы
      for (const w of walls) {
        const a = gridToSvg(w.from);
        const b = gridToSvg(w.to);
        if (distPointToSegment(c.x, c.y, a.x, a.y, b.x, b.y) <= TOL) {
          return false;
        }
      }
      // Внутри polygon? — скрываем.
      return isPointInPolygon(c.x, c.y, polygonSvg);
    },
    [polygonSvg, walls],
  );

  const commitWalls = useCallback(
    (next: Wall[]): void => {
      setRoomShape(roomId, { walls: next });
    },
    [roomId, setRoomShape],
  );

  const handlePointClick = useCallback(
    (p: GridPoint): void => {
      // Первый клик в цепочке — просто запоминаем.
      if (activeStart === null) {
        setActiveStart(p);
        return;
      }
      // Повторный клик в ту же точку — игнор.
      if (samePoint(activeStart, p)) return;
      // Только collinear-точки (одна горизонталь либо одна вертикаль).
      // Сегмент может пересекать несколько точек сетки — это одна стена.
      if (!areCollinearOrtho(activeStart, p)) return;

      const newWallStub = makeWall(activeStart, p);
      const newDir = wallDirection(newWallStub);
      const lastWall = walls[walls.length - 1];

      // Merge co-directional: если новая стена продолжает предыдущую в том же
      // направлении — объединяем их в одну. Иначе пользователь, кликая
      // (0,0)→(1,0)→(2,0), получал бы 2 стены с 2 формами размера, хотя
      // топологически это одна стена 2 клетки длиной.
      if (lastWall && newDir !== null && samePoint(lastWall.to, activeStart)) {
        const lastDir = wallDirection(lastWall);
        const lastDx = Math.sign(lastWall.to.col - lastWall.from.col);
        const lastDy = Math.sign(lastWall.to.row - lastWall.from.row);
        const newDx = Math.sign(p.col - activeStart.col);
        const newDy = Math.sign(p.row - activeStart.row);
        if (lastDir === newDir && lastDx === newDx && lastDy === newDy) {
          // lengthMm сбрасываем: размер стены изменился, старое значение неактуально.
          const merged: Wall = { from: lastWall.from, to: p, lengthMm: null };
          const nextWalls = [...walls.slice(0, -1), merged];
          commitWalls(nextWalls);
          const firstWall = nextWalls[0];
          if (firstWall && samePoint(p, firstWall.from) && nextWalls.length >= 4) {
            setActiveStart(null);
          } else {
            setActiveStart(p);
          }
          return;
        }
      }

      const nextWalls = [...walls, newWallStub];
      commitWalls(nextWalls);

      // Замыкание: если кликнули в стартовую точку первой стены — цепочка завершена.
      const firstWall = nextWalls[0];
      if (firstWall && samePoint(p, firstWall.from) && nextWalls.length >= 4) {
        setActiveStart(null);
      } else {
        setActiveStart(p);
      }
    },
    [activeStart, walls, commitWalls],
  );

  const handleClear = useCallback((): void => {
    setActiveStart(null);
    setFocusedWallIdx(null);
    commitWalls([]);
  }, [commitWalls]);

  const handleUndoLast = useCallback((): void => {
    if (walls.length === 0) return;
    const next = walls.slice(0, -1);
    commitWalls(next);
    // После undo голова цепочки = to последней оставшейся стены, либо null.
    const last = next[next.length - 1];
    setActiveStart(last ? last.to : null);
    setFocusedWallIdx((prev) => (prev !== null && prev >= next.length ? null : prev));
  }, [walls, commitWalls]);

  const updateWallLength = useCallback(
    (idx: number, mm: number): void => {
      const next = walls.map((w, i) => (i === idx ? { ...w, lengthMm: mm } : w));
      commitWalls(next);
    },
    [walls, commitWalls],
  );

  // Перевод clientX/Y в SVG-координаты через bounding rect и viewBox-масштаб.
  const handlePointerMove = useCallback((e: PointerEvent<SVGSVGElement>): void => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_BOX;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_BOX;
    const snapped = snapToGrid(x, y);
    setCursorPos((prev) => {
      if (snapped === null) return prev === null ? prev : null;
      if (prev !== null && samePoint(prev, snapped)) return prev;
      return snapped;
    });
  }, []);

  const handlePointerLeave = useCallback((): void => {
    setCursorPos(null);
  }, []);

  // Статусная строка + отдельное сообщение о проблеме (warning).
  // Цель: не оставлять пользователя с ситуацией «все галки ✓, но схема не строится» —
  // самая частая причина в этом случае: суммы стен противоположных направлений
  // не совпадают (consistent === false), что блокирует buildShapePolygon.
  const { statusText, issueText } = useMemo<{
    statusText: string;
    issueText: string | null;
  }>(() => {
    const n = walls.length;
    if (n === 0) return { statusText: 'Стен: 0', issueText: null };
    const closed = validation?.closed ?? false;
    const sized = validation?.allSized ?? false;
    const consistent = validation?.consistent ?? false;
    const complete = validation?.complete ?? false;

    if (complete) {
      return { statusText: `Стен: ${n} · готово`, issueText: null };
    }

    const status = `Стен: ${n} · контур ${closed ? 'замкнут' : 'не замкнут'} · ${
      sized ? 'размеры заполнены' : 'не все размеры заполнены'
    }`;

    // Если контур замкнут и размеры заданы, но не сошлись — даём конкретику.
    if (closed && sized && !consistent) {
      const sums = computeWallSums(walls);
      const parts: string[] = [];
      if (sums.hRight !== sums.hLeft) {
        parts.push(
          `по горизонтали ${formatMTrim(sums.hRight)} ≠ ${formatMTrim(sums.hLeft)}`,
        );
      }
      if (sums.vDown !== sums.vUp) {
        parts.push(
          `по вертикали ${formatMTrim(sums.vDown)} ≠ ${formatMTrim(sums.vUp)}`,
        );
      }
      const detail = parts.length > 0 ? `: ${parts.join(', ')}` : '';
      return {
        statusText: status,
        issueText: `Суммы противоположных стен не совпадают${detail}. Исправьте размеры — иначе схема не построится.`,
      };
    }

    // Иной незавершённый случай — берём первый issue от validateShape, если есть.
    const firstIssue = validation?.issues[0];
    return {
      statusText: status,
      issueText: firstIssue ?? null,
    };
  }, [walls, validation]);

  // Конвертируем процент SVG в проценты overlay-div (одинаковый origin/size).
  const pct = (v: number): string => `${v}%`;

  // Preview-линия от активной точки к курсору (только если ortho-collinear).
  const previewLine = useMemo(() => {
    if (activeStart === null || cursorPos === null) return null;
    if (samePoint(activeStart, cursorPos)) return null;
    if (!areCollinearOrtho(activeStart, cursorPos)) return null;
    const a = gridToSvg(activeStart);
    const b = gridToSvg(cursorPos);
    return { a, b };
  }, [activeStart, cursorPos]);

  // Направление «наружу» для overlay-форм: знак signed area определяет ориентацию
  // обхода (CW/CCW). Если контур замкнут — выносим формы наружу. Если нет —
  // используем дефолтные направления (см. ниже).
  const polygonOutwardSign = useMemo<1 | -1 | 0>(() => {
    if (!polygonSvg) return 0;
    const s = signedAreaSvg(polygonSvg);
    if (s === 0) return 0;
    // SVG: ось Y вниз. При CW-обходе signed area > 0; нормаль «наружу» получается
    // поворотом ребра на -90° (для CW) или +90° (для CCW). Знак мы используем
    // ниже для того, чтобы умножить вектор нормали и получить наружу.
    return s > 0 ? 1 : -1;
  }, [polygonSvg]);

  // Позиции overlay-форм (центр в SVG-units 0..VIEW_BOX). Состоит из:
  //  1) baseline: t-смещение по 4-уровневому циклу + перпендикулярный отступ наружу;
  //  2) iterative AABB resolver: при наложении двух форм сдвигаем j-ю по большей оси.
  // Координаты в clamp [0..VIEW_BOX] (формы могут быть за canvasFrame частично — это
  // нормально, overflow:visible). Resolver чисто-вычислительный, в useMemo.
  const formPositions = useMemo<{ x: number; y: number }[]>(() => {
    const NORMAL_OFFSET = 6;
    const positions = walls.map<{ x: number; y: number }>((w, idx) => {
      const a = gridToSvg(w.from);
      const b = gridToSvg(w.to);
      const dir = wallDirection(w);
      const isHorizontal = dir === 'horizontal';
      const tBase = FORM_T_PATTERN[idx % FORM_T_PATTERN.length] ?? 0.5;
      const baseX = a.x + (b.x - a.x) * tBase;
      const baseY = a.y + (b.y - a.y) * tBase;
      let offsetX = 0;
      let offsetY = 0;
      if (polygonOutwardSign !== 0) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const sign = polygonOutwardSign;
        offsetX = uy * NORMAL_OFFSET * sign;
        offsetY = -ux * NORMAL_OFFSET * sign;
      } else if (isHorizontal) {
        offsetY = -NORMAL_OFFSET;
      } else {
        offsetX = NORMAL_OFFSET;
      }
      return { x: baseX + offsetX, y: baseY + offsetY };
    });

    // Iterative AABB resolver: 8 проходов, j двигается, i остаётся.
    const halfW = FORM_W / 2;
    const halfH = FORM_H / 2;
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const pi = positions[i]!;
          const pj = positions[j]!;
          const overlapX = FORM_W - Math.abs(pi.x - pj.x);
          const overlapY = FORM_H - Math.abs(pi.y - pj.y);
          if (overlapX <= 0 || overlapY <= 0) continue;
          // Раздвигаем j по оси с меньшим overlap (даёт минимальное смещение).
          if (overlapX < overlapY) {
            const dir = pj.x >= pi.x ? 1 : -1;
            pj.x = pi.x + dir * FORM_W;
          } else {
            const dir = pj.y >= pi.y ? 1 : -1;
            pj.y = pi.y + dir * FORM_H;
          }
          // Clamp в пределы canvasFrame (с учётом размера AABB, чтобы форма не вылезла полностью).
          if (pj.x < halfW) pj.x = halfW;
          if (pj.x > VIEW_BOX - halfW) pj.x = VIEW_BOX - halfW;
          if (pj.y < halfH) pj.y = halfH;
          if (pj.y > VIEW_BOX - halfH) pj.y = VIEW_BOX - halfH;
          moved = true;
        }
      }
      if (!moved) break;
    }

    return positions;
  }, [walls, polygonOutwardSign]);

  return (
    <Card surface="surface-1" padding="md">
      <div className={styles.editor}>
        <p className={styles.hint}>
          Кликните по двум соседним точкам сетки, чтобы провести стену. Только горизонтальные и
          вертикальные линии. Контур должен замкнуться.
        </p>

        <div className={styles.canvasFrame}>
          <svg
            ref={svgRef}
            className={styles.svg}
            viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
            role="img"
            aria-label="Редактор свободной планировки помещения"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            {/* Вспомогательная сетка: тонкие линии между точками. */}
            <g>
              {Array.from({ length: GRID_MAX + 1 }, (_, i) => {
                const coord = VIEW_PADDING + i * STEP;
                return (
                  <g key={`grid-${i}`}>
                    <line
                      x1={VIEW_PADDING}
                      y1={coord}
                      x2={VIEW_BOX - VIEW_PADDING}
                      y2={coord}
                      className={styles.gridLine}
                    />
                    <line
                      x1={coord}
                      y1={VIEW_PADDING}
                      x2={coord}
                      y2={VIEW_BOX - VIEW_PADDING}
                      className={styles.gridLine}
                    />
                  </g>
                );
              })}
            </g>

            {/* Заливка замкнутого polygon — под стенами. */}
            {polygonSvg && (
              <polygon
                className={styles.polygonFill}
                points={polygonSvg.map((p) => `${p.x},${p.y}`).join(' ')}
              />
            )}

            {/* Preview-линия «резинка» от активной точки к курсору. */}
            {previewLine && (
              <line
                x1={previewLine.a.x}
                y1={previewLine.a.y}
                x2={previewLine.b.x}
                y2={previewLine.b.y}
                className={styles.previewLine}
              />
            )}

            {/* Нарисованные стены. */}
            <g>
              {walls.map((w, i) => {
                const a = gridToSvg(w.from);
                const b = gridToSvg(w.to);
                const isFocused = focusedWallIdx === i;
                return (
                  <line
                    key={`wall-${i}-${w.from.col},${w.from.row}-${w.to.col},${w.to.row}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={isFocused ? `${styles.wall} ${styles.wallFocused}` : styles.wall}
                  />
                );
              })}
            </g>

            {/* Точки сетки (видимый круг + увеличенный hit-area).
                При замкнутом контуре скрываем точки, лежащие строго внутри polygon. */}
            <g>
              {gridPoints.map((p) => {
                if (isPointHidden(p)) return null;
                const c = gridToSvg(p);
                const isActive = activeStart !== null && samePoint(activeStart, p);
                return (
                  <g key={`pt-${p.col},${p.row}`}>
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={isActive ? 1.6 : 1.2}
                      className={isActive ? styles.dotActive : styles.dot}
                    />
                    {/* Невидимая увеличенная hit-area — для тача. r=5 ≈ 18px при 360px фрейме. */}
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={5}
                      className={styles.dotHit}
                      onClick={() => handlePointClick(p)}
                    />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Overlay для inline-форм размеров стен. Координаты — % от ViewBox. */}
          <div className={styles.overlay} aria-hidden={false}>
            {walls.map((w, idx) => {
              const pos = formPositions[idx];
              if (!pos) return null;
              const left = pct(pos.x);
              const top = pct(pos.y);
              return (
                <div
                  key={`form-${idx}`}
                  className={styles.wallForm}
                  style={{
                    left,
                    top,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <WallSizeInput
                    ariaLabel="Длина стены, м"
                    valueMm={w.lengthMm ?? 0}
                    onChangeMm={(mm) => updateWallLength(idx, mm)}
                    minMm={DIMENSION_MIN_MM}
                    maxMm={DIMENSION_MAX_MM}
                    onFocusChange={(focused) => {
                      if (focused) setFocusedWallIdx(idx);
                      else setFocusedWallIdx((prev) => (prev === idx ? null : prev));
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.actions}>
          <IconButton
            size="sm"
            ariaLabel="Отменить последнюю стену"
            title="Отменить последнюю стену"
            disabled={walls.length === 0}
            onClick={handleUndoLast}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6 4L2 8l4 4M2 8h9a3 3 0 0 1 0 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
          <IconButton
            size="sm"
            ariaLabel="Очистить планировку"
            title="Очистить планировку"
            disabled={walls.length === 0}
            onClick={handleClear}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
          <span className={styles.status}>{statusText}</span>
        </div>

        {issueText && (
          <p className={styles.issue} role="alert">
            {issueText}
          </p>
        )}
      </div>
    </Card>
  );
}
