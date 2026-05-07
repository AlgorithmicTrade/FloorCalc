/**
 * Полоса действий под результатом: компактные icon-кнопки
 * Копировать / PNG / PDF / Печать. Подпись действия — в native `title`.
 *
 * stageRef передаётся через ref-объект (не через сам Konva-Stage), чтобы
 * SchemeView мог forward-вынести только нужные методы (toBlob/toDataURL/toCanvas).
 *
 * Состояние «Скопировано» — короткий visual-cue: иконка чекмарка на 1.5с.
 */

import { useCallback, useState, type RefObject } from 'react';
import { IconButton } from '@/components/design-system/IconButton';
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
      <IconButton
        size="sm"
        ariaLabel={copyState === 'copied' ? 'Скопировано' : 'Копировать'}
        title={copyState === 'copied' ? 'Скопировано' : 'Копировать'}
        onClick={handleCopy}
      >
        {copyState === 'copied' ? <CheckIcon /> : <CopyIcon />}
      </IconButton>
      <IconButton
        size="sm"
        ariaLabel="PNG"
        title="Сохранить PNG"
        onClick={handleSavePng}
        disabled={busy === 'png'}
      >
        <ImageIcon />
      </IconButton>
      <IconButton
        size="sm"
        ariaLabel="PDF"
        title="Сохранить PDF"
        onClick={handleSavePdf}
        disabled={busy === 'pdf'}
      >
        <PdfIcon />
      </IconButton>
      <IconButton
        size="sm"
        ariaLabel="Печать"
        title="Печать"
        onClick={handlePrint}
        disabled={busy === 'print'}
      >
        <PrinterIcon />
      </IconButton>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="5"
        y="5"
        width="8"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3 11V3a1 1 0 0 1 1-1h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="6" cy="7" r="1.2" fill="currentColor" />
      <path
        d="M3 11.5l3-3 3 3 2-2 2 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 2h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <text
        x="8"
        y="13"
        textAnchor="middle"
        fontSize="4.5"
        fontWeight="700"
        fill="currentColor"
      >
        PDF
      </text>
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6V2h8v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect
        x="2"
        y="6"
        width="12"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="4.5"
        y="9"
        width="7"
        height="5"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--color-surface-1, transparent)"
      />
    </svg>
  );
}
