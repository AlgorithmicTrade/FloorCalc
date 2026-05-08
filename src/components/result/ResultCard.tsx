/**
 * Карточка одного режима расчёта (economy или optimal) для активного помещения.
 *
 * Поведение:
 *  1) Считает ключ кеша через `hashCalculationKey()`.
 *  2) Tries cache-hit → если null, вызывает `selectBestRoll(...)` и кеширует.
 *  3) Если `activeRolls.length === 0` — рендерит EmptyState («выберите рулон»).
 *  4) Layout: заголовок (ModeTitleWithTooltip + warnings-mark-«*») → SchemeView (схема + stats-строка
 *     внизу схемы) → ResultActions (compact icon-buttons). ResultText скрыт через
 *     visually-hidden как a11y-fallback.
 *
 * Кеш не очищается автоматически при выходе из компонента — он singleton-модуль
 * (`resultsCache`), переживёт re-mount табов / переключение помещений.
 */

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/design-system/Card';
import { EmptyState } from '@/components/layout/EmptyState';
import { selectMixed } from '@/domain/calculator';
import { formatM } from '@/domain/units';
import { hashCalculationKey } from '@/lib/hash';
import { resultsCache } from '@/store/resultsCache';
import { useCatalogStore } from '@/store/catalogStore';
import type { Mode, RollType, Room, CalculationResult } from '@/domain/types';
import { SchemeView, type SchemeViewHandle } from './SchemeView';
import { ResultText, formatResultAsPlainText } from './ResultText';
import { ResultActions } from './ResultActions';
import styles from './ResultCard.module.css';

export interface ResultCardProps {
  mode: Mode;
  room: Room;
  activeRolls: RollType[];
}

const MODE_TITLES: Record<Mode, string> = {
  economy: 'Экономный режим',
  optimal: 'Оптимальный режим',
};

const MODE_TOOLTIPS: Record<Mode, string> = {
  economy: 'Подбирается экономная раскладка с меньшим кол-вом рулонов',
  optimal: 'Подбирается оптимальная раскладка с меньшим кол-вом кусков',
};

interface ModeTitleWithTooltipProps {
  mode: Mode;
  /** Человекочитаемое название режима */
  title: string;
  /** Текст подсказки */
  tooltip: string;
}

/**
 * Кликабельный заголовок режима с inline-попапом подсказки.
 *
 * - Клик/Enter/Space → toggle попапа.
 * - Escape → закрыть.
 * - Клик вне контейнера → закрыть.
 * - `title=""` на `<Eyebrow>` НЕ используется; вся семантика через aria-атрибуты.
 */
function ModeTitleWithTooltip({ mode, title, tooltip }: ModeTitleWithTooltipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = `mode-tooltip-${mode}`;

  // Закрытие при клике вне контейнера
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    } else {
      document.removeEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open, handleOutsideClick]);

  // Закрытие по Escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.modeTitle} ref={containerRef}>
      <button
        type="button"
        className={`t-eyebrow ${styles.modeTitleBtn}`}
        aria-expanded={open}
        aria-controls={tooltipId}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        {title}
      </button>
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className={styles.modeTooltip}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}

interface CalcOutcome {
  result: CalculationResult;
  roll: RollType;
}

function computeOutcome(room: Room, activeRolls: RollType[], mode: Mode): CalcOutcome | null {
  if (activeRolls.length === 0) return null;
  const key = hashCalculationKey({
    roomId: room.id,
    roomWidth: room.width,
    roomLength: room.length,
    rolls: activeRolls,
    mode,
  });
  const cached = resultsCache.get(key);
  if (cached) {
    // Восстанавливаем roll по rollTypeId из активных (он точно там есть, иначе
    // ключ кеша был бы другим; fallback — первый активный).
    const roll = activeRolls.find((r) => r.id === cached.rollTypeId) ?? activeRolls[0]!;
    return { result: cached, roll };
  }
  const selection = selectMixed(room, activeRolls, mode);
  if ('error' in selection) return null;
  resultsCache.set(key, selection.result);
  return { result: selection.result, roll: selection.roll };
}

export function ResultCard({ mode, room, activeRolls }: ResultCardProps) {
  const stageRef = useRef<SchemeViewHandle | null>(null);
  // Полный каталог (вкл. неактивные) нужен для стабильных цветов по типоразмеру.
  const fullCatalog = useCatalogStore((s) => s.rolls);

  const outcome = useMemo(
    () => computeOutcome(room, activeRolls, mode),
    [room.id, room.width, room.length, activeRolls, mode],
  );

  const modeTitle = MODE_TITLES[mode];

  if (!outcome) {
    return (
      <Card surface="surface-1" padding="md">
        <ModeTitleWithTooltip
          mode={mode}
          title={modeTitle}
          tooltip={MODE_TOOLTIPS[mode]}
        />
        <EmptyState
          title="Выберите рулон"
          hint="Активируйте хотя бы один типоразмер из каталога слева."
        />
      </Card>
    );
  }

  const { result, roll } = outcome;
  const rollDims = `${formatM(roll.width)} × ${formatM(roll.length)}`;
  const plainText = formatResultAsPlainText(result, {
    roomName: room.name,
    rollDims,
    modeTitle,
  });
  const filenameHint = `${(room.name || 'Помещение').replace(/[^\p{L}\p{N}_-]+/gu, '_')}_${mode}`;
  const hasWarnings = result.warnings.length > 0;

  return (
    <Card surface="surface-1" padding="md" className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <ModeTitleWithTooltip
            mode={mode}
            title={modeTitle}
            tooltip={MODE_TOOLTIPS[mode]}
          />
          {hasWarnings && (
            <span
              className={styles.warnMark}
              tabIndex={0}
              role="img"
              aria-label={`Предупреждения: ${result.warnings.join('. ')}`}
              title={result.warnings.join('\n')}
            >
              *
            </span>
          )}
        </div>
        <ResultActions stageRef={stageRef} resultText={plainText} filenameHint={filenameHint} />
      </div>
      {/* ResultText скрыт как a11y-fallback; основная статистика — внутри Konva stage */}
      <div className={styles.visuallyHidden}>
        <ResultText result={result} modeTitle={modeTitle} />
      </div>
      <SchemeView
        ref={stageRef}
        result={result}
        room={room}
        roll={roll}
        catalog={fullCatalog}
        widthPx={640}
        heightPx={360}
        roomAspect={room.length / room.width}
      />
    </Card>
  );
}
