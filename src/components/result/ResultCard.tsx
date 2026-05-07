/**
 * Карточка одного режима расчёта (economy или optimal) для активного помещения.
 *
 * Поведение:
 *  1) Считает ключ кеша через `hashCalculationKey()`.
 *  2) Tries cache-hit → если null, вызывает `selectBestRoll(...)` и кеширует.
 *  3) Если `activeRolls.length === 0` — рендерит EmptyState («выберите рулон»).
 *  4) Layout: Eyebrow (название режима) + 40/60 split (ResultText | SchemeView)
 *     + ResultActions внизу.
 *
 * Кеш не очищается автоматически при выходе из компонента — он singleton-модуль
 * (`resultsCache`), переживёт re-mount табов / переключение помещений.
 */

import { useMemo, useRef } from 'react';
import { Card } from '@/components/design-system/Card';
import { Eyebrow } from '@/components/design-system/Eyebrow';
import { EmptyState } from '@/components/layout/EmptyState';
import { selectBestRoll } from '@/domain/calculator';
import { formatM } from '@/domain/units';
import { hashCalculationKey } from '@/lib/hash';
import { resultsCache } from '@/store/resultsCache';
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
  const selection = selectBestRoll(room, activeRolls, mode);
  if ('error' in selection) return null;
  resultsCache.set(key, selection.result);
  return { result: selection.result, roll: selection.roll };
}

export function ResultCard({ mode, room, activeRolls }: ResultCardProps) {
  const stageRef = useRef<SchemeViewHandle | null>(null);

  const outcome = useMemo(
    () => computeOutcome(room, activeRolls, mode),
    [room.id, room.width, room.length, activeRolls, mode],
  );

  const modeTitle = MODE_TITLES[mode];

  if (!outcome) {
    return (
      <Card surface="surface-1" padding="md">
        <Eyebrow>{modeTitle}</Eyebrow>
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

  return (
    <Card surface="surface-1" padding="md" className={styles.card}>
      <Eyebrow>{modeTitle}</Eyebrow>
      <div className={styles.split}>
        <ResultText result={result} modeTitle={modeTitle} />
        <SchemeView ref={stageRef} result={result} room={room} widthPx={480} heightPx={360} />
      </div>
      <ResultActions stageRef={stageRef} resultText={plainText} filenameHint={filenameHint} />
    </Card>
  );
}
