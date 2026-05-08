/**
 * Экспорт схемы в PNG-файл через стандартный browser-download
 * (`<a download>` + `URL.createObjectURL`). Никаких диалогов сохранения —
 * браузер сам спросит путь, если у пользователя так настроено.
 *
 * stage — minimal интерфейс Konva-сцены: нам нужен только `toBlob()`. Это
 * позволяет передавать `stageRef.current` через `useImperativeHandle`-экспонированный
 * объект и не тащить тип `Stage` из `konva` в renderer-логику.
 */

export interface PngExportable {
  toBlob: () => Promise<Blob | null>;
}

export type SaveResult = { canceled: boolean };

export async function exportPng(
  stage: PngExportable | null,
  filenameHint: string,
): Promise<SaveResult> {
  if (!stage) return { canceled: true };
  const blob = await stage.toBlob();
  if (!blob) {
    throw new Error('Не удалось получить изображение со схемы');
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameHint}.png`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Освобождаем blob-URL после клика. Браузер уже инициировал скачивание.
    URL.revokeObjectURL(url);
  }
  return { canceled: false };
}
