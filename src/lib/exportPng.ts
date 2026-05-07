/**
 * Экспорт схемы в PNG-файл через нативный диалог сохранения.
 *
 * stage — minimal интерфейс Konva-сцены: нам нужен только `toBlob()`. Это
 * позволяет передавать `stageRef.current` через `useImperativeHandle`-экспонированный
 * объект и не тащить тип `Stage` из `konva` в renderer-логику.
 */

import type { SaveResult } from '@shared/ipc-contract';

export interface PngExportable {
  toBlob: () => Promise<Blob | null>;
}

export async function exportPng(
  stage: PngExportable | null,
  filenameHint: string,
): Promise<SaveResult> {
  if (!stage) return { canceled: true };
  const blob = await stage.toBlob();
  if (!blob) {
    throw new Error('Не удалось получить изображение со схемы');
  }
  const buf = await blob.arrayBuffer();
  const { api } = await import('@/ipc/client');
  return api.files.savePng(buf, `${filenameHint}.png`);
}
