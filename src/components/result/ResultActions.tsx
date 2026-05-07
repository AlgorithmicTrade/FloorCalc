/**
 * Полоса действий под результатом: Копировать / PNG / PDF / Печать.
 *
 * stageRef передаётся через ref-объект (не через сам Konva-Stage), чтобы
 * SchemeView мог forward-вынести только нужные методы (toBlob/toDataURL/toCanvas).
 *
 * Состояние «Скопировано» — короткий visual-cue без внешнего toast-механизма.
 * После 1.5 сек надпись возвращается к исходной.
 */

import { useCallback, useState, type RefObject } from 'react';
import { Button } from '@/components/design-system/Button';
import { copyImage } from '@/lib/copyImage';
import { exportPng } from '@/lib/exportPng';
import { exportPdf } from '@/lib/exportPdf';
import { printScheme } from '@/lib/printScheme';
import type { SchemeViewHandle } from './SchemeView';
import styles from './ResultActions.module.css';

export interface ResultActionsProps {
  stageRef: RefObject<SchemeViewHandle | null>;
  resultText: string;
  filenameHint: string;
}

export function ResultActions({ stageRef, resultText, filenameHint }: ResultActionsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [busy, setBusy] = useState<null | 'png' | 'pdf' | 'print'>(null);

  const handleCopy = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    void copyImage(stage.toBlob())
      .then((ok) => {
        if (ok) {
          setCopyState('copied');
          setTimeout(() => setCopyState('idle'), 1500);
        }
      })
      .catch((e) => {
        console.error('Не удалось скопировать изображение', e);
      });
  }, [stageRef]);

  const handleSavePng = useCallback(() => {
    setBusy('png');
    void exportPng(stageRef.current, filenameHint)
      .catch((e) => console.error('Ошибка сохранения PNG', e))
      .finally(() => setBusy(null));
  }, [stageRef, filenameHint]);

  const handleSavePdf = useCallback(() => {
    setBusy('pdf');
    void exportPdf(stageRef.current, resultText, filenameHint)
      .catch((e) => console.error('Ошибка сохранения PDF', e))
      .finally(() => setBusy(null));
  }, [stageRef, resultText, filenameHint]);

  const handlePrint = useCallback(() => {
    setBusy('print');
    void printScheme(stageRef.current, resultText)
      .catch((e) => console.error('Ошибка печати', e))
      .finally(() => setBusy(null));
  }, [stageRef, resultText]);

  return (
    <div className={styles.row}>
      <Button variant="secondary" onClick={handleCopy}>
        {copyState === 'copied' ? 'Скопировано' : 'Копировать'}
      </Button>
      <Button variant="secondary" onClick={handleSavePng} disabled={busy === 'png'}>
        Сохранить PNG
      </Button>
      <Button variant="secondary" onClick={handleSavePdf} disabled={busy === 'pdf'}>
        PDF
      </Button>
      <Button variant="secondary" onClick={handlePrint} disabled={busy === 'print'}>
        Печать
      </Button>
    </div>
  );
}
