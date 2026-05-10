/**
 * Парсер `RELEASE_NOTES.md`.
 *
 * Возвращает массив записей по версиям (порядок исходного файла —
 * новые сверху). Для каждой записи извлекает version и releasedOn,
 * и вычищает контент от технического шума, бесполезного конечному
 * пользователю:
 *   - подразделы «Изменения:» (со списком файлов и методов);
 *   - footer «_This release was automatically generated from N commits._»;
 *   - горизонтальные разделители `---` между релизами.
 *
 * Подразделы «Решение:» и «Эффект:» сохраняются — они описывают
 * пользовательское поведение и важны для модала «Что нового».
 */

export interface ReleaseNotesEntry {
  /** Чистая версия без префикса `v`, например `1.1.5`. */
  version: string;
  /** Дата релиза или null, если строка `_Released on …_` отсутствует. */
  releasedOn: string | null;
  /**
   * Markdown-контент релиза (после заголовка и даты, до следующего
   * `## v` или конца файла) с удалёнными секциями «Изменения:»,
   * footer'ами и горизонтальными разделителями.
   */
  contentMd: string;
}

const VERSION_HEADER_RE = /^## v(\d+\.\d+\.\d+(?:[-.\w]*)?)\s*$/m;
const RELEASED_ON_RE = /_Released on (.+?)_/;
const FOOTER_RE = /^_This release was automatically generated from \d+ commits?\._\s*$/;
const HR_RE = /^---\s*$/;

/**
 * Удалить из контента релиза подраздел «Изменения:» вместе с его
 * вложенными bullet'ами.
 *
 * Структура в RELEASE_NOTES.md: каждый bullet верхнего уровня описывает
 * коммит, внутри 2 пробела + `Решение:` / `Изменения:` / `Эффект:`,
 * затем буллеты с 2 пробелами (`  - …`) и под-буллеты с 4 пробелами
 * (`    - …`). Блок «Изменения:» начинается строкой `  Изменения:` и
 * заканчивается перед `  Эффект:`, либо перед пустой строкой,
 * предшествующей следующему top-level bullet'у, либо перед концом блока.
 */
function stripChangesSections(contentMd: string): string {
  const lines = contentMd.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    // Маркер начала «Изменения:» — ровно `  Изменения:` (2 пробела отступа).
    if (/^ {2}Изменения:\s*$/.test(line)) {
      i += 1;
      // Пропускаем все строки, относящиеся к блоку «Изменения:»:
      // они начинаются с >=2 пробелов и являются bullet'ами либо
      // продолжением. Останавливаемся на:
      //   - `  Эффект:` или `  Решение:` — следующий подраздел;
      //   - строке, начинающейся не с пробела (новый top-level контент);
      //   - пустой строке, после которой идёт top-level bullet или
      //     заголовок (граница «коммитов»).
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (/^ {2}(?:Эффект|Решение):\s*$/.test(next)) break;
        // Пустая строка может разделять блоки; смотрим вперёд.
        if (next.trim() === '') {
          // Если после пустой строки идёт что-то с отступом >=2 пробелов
          // и это снова `  Изменения:`/`  Решение:`/`  Эффект:`/буллет —
          // продолжаем поглощать. Иначе — выходим, оставляя пустую строку
          // нетронутой для верхнего цикла.
          const nn = lines[i + 1] ?? '';
          if (/^ {2,}/.test(nn) && !/^ {2}(?:Эффект|Решение):\s*$/.test(nn)) {
            i += 1;
            continue;
          }
          break;
        }
        // Любая строка с отступом >= 2 пробелов — часть «Изменения:».
        if (/^ {2,}/.test(next)) {
          i += 1;
          continue;
        }
        // Иначе — конец блока.
        break;
      }
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out.join('\n');
}

/**
 * Вычистить footer-строки и горизонтальные разделители `---`.
 */
function stripFootersAndHr(contentMd: string): string {
  return contentMd
    .split('\n')
    .filter((l) => !FOOTER_RE.test(l) && !HR_RE.test(l))
    .join('\n');
}

/**
 * Свернуть длинные подряд идущие пустые строки в максимум одну —
 * после удаления секций часто остаются «дыры» в 3-4 пустых строки.
 */
function collapseBlankLines(contentMd: string): string {
  // Сначала trim'нуть trailing-whitespace в каждой строке (пустые строки
  // с пробелами остаются после удаления footer/HR-строк).
  const trimmed = contentMd
    .split('\n')
    .map((l) => l.replace(/[\t ]+$/, ''))
    .join('\n');
  return trimmed.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Парсит весь `RELEASE_NOTES.md` в массив записей.
 *
 * Алгоритм:
 *   1. Разбить файл по `^## v(X.Y.Z)$` — каждый матч открывает блок.
 *   2. Внутри блока выдернуть `_Released on …_`.
 *   3. Контент = всё после строки даты (или после header, если даты нет)
 *      до следующего version-header.
 *   4. Прогнать через stripChangesSections → stripFootersAndHr → collapse.
 */
export function parseReleaseNotes(rawMd: string): ReleaseNotesEntry[] {
  const lines = rawMd.split('\n');
  const headerIndices: Array<{ index: number; version: string }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = VERSION_HEADER_RE.exec(lines[i] ?? '');
    if (m && m[1]) headerIndices.push({ index: i, version: m[1] });
  }
  if (headerIndices.length === 0) return [];

  const entries: ReleaseNotesEntry[] = [];
  for (let h = 0; h < headerIndices.length; h += 1) {
    const start = headerIndices[h]!.index;
    const end = h + 1 < headerIndices.length ? headerIndices[h + 1]!.index : lines.length;
    const version = headerIndices[h]!.version;
    const block = lines.slice(start + 1, end);

    // Извлекаем дату.
    let releasedOn: string | null = null;
    let contentStart = 0;
    for (let bi = 0; bi < block.length; bi += 1) {
      const dm = RELEASED_ON_RE.exec(block[bi] ?? '');
      if (dm && dm[1]) {
        releasedOn = dm[1].trim();
        contentStart = bi + 1;
        break;
      }
      // Если встретили непустую строку, не являющуюся датой — там даты нет.
      if ((block[bi] ?? '').trim() !== '') {
        contentStart = 0;
        break;
      }
    }

    let contentMd = block.slice(contentStart).join('\n');
    contentMd = stripChangesSections(contentMd);
    contentMd = stripFootersAndHr(contentMd);
    contentMd = collapseBlankLines(contentMd);

    entries.push({ version, releasedOn, contentMd });
  }
  return entries;
}

/**
 * Возвращает запись для конкретной версии (без префикса `v`) или null.
 */
export function findReleaseNotesByVersion(
  entries: readonly ReleaseNotesEntry[],
  version: string,
): ReleaseNotesEntry | null {
  const normalized = version.startsWith('v') ? version.slice(1) : version;
  return entries.find((e) => e.version === normalized) ?? null;
}
