import { describe, it, expect } from 'vitest';
import { parseReleaseNotes, findReleaseNotesByVersion } from '../../src/lib/releaseNotes';

/* Inline-фикстура, имитирующая реальный формат RELEASE_NOTES.md.
   Содержит 2 версии, секции «Решение/Изменения/Эффект», footer, разделители ---. */
const FIXTURE = `# Release Notes

User-facing release notes for all versions.

## v1.1.5

_Released on 2026-05-08_

### 🐛 Bug Fixes

- **Web**: убрать тень у номера рулона

  Решение:
  - Убрать белую обводку у номеров.

  Изменения:
  - src/components/result/SchemeView.tsx:
    - pieceLabel Konva.Text: удалены stroke / strokeWidth.
  - src/App.tsx:
    - sidebarToggle button: className комбинирует.

  Эффект:
  - Цифры рулонов на схеме читаются как чистый цветной fill.


---

_This release was automatically generated from 1 commits._

## v1.1.4

_Released on 2026-05-08_

### ✨ New Features

- **Web**: collapse-сайдбар

  Решение:
  - В ResultCard заменить нативный tooltip на inline-popup.

  Изменения:
  - src/components/result/ResultCard.tsx: inline-компонент ModeTitleWithTooltip.
  - src/components/result/ResultCard.module.css: .modeTitle / .modeTooltip.

  Эффект:
  - Заголовок режима визуально маркирован как кликабельный.


---

_This release was automatically generated from 1 commits._
`;

describe('parseReleaseNotes', () => {
  it('парсит multiple-version файл и возвращает entries в порядке появления', () => {
    const entries = parseReleaseNotes(FIXTURE);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.version).toBe('1.1.5');
    expect(entries[1]?.version).toBe('1.1.4');
  });

  it('извлекает version и releasedOn корректно', () => {
    const entries = parseReleaseNotes(FIXTURE);
    expect(entries[0]).toMatchObject({
      version: '1.1.5',
      releasedOn: '2026-05-08',
    });
    expect(entries[1]).toMatchObject({
      version: '1.1.4',
      releasedOn: '2026-05-08',
    });
  });

  it('УДАЛЯЕТ секцию «Изменения:» полностью (нет упоминаний src/components/...)', () => {
    const entries = parseReleaseNotes(FIXTURE);
    for (const entry of entries) {
      expect(entry.contentMd).not.toMatch(/Изменения:/);
      expect(entry.contentMd).not.toMatch(/src\/components\//);
      expect(entry.contentMd).not.toMatch(/src\/App\.tsx/);
      expect(entry.contentMd).not.toMatch(/SchemeView\.tsx/);
      expect(entry.contentMd).not.toMatch(/ResultCard\.module\.css/);
    }
  });

  it('УДАЛЯЕТ footer «_This release was automatically generated_»', () => {
    const entries = parseReleaseNotes(FIXTURE);
    for (const entry of entries) {
      expect(entry.contentMd).not.toMatch(/automatically generated/);
    }
  });

  it('УДАЛЯЕТ горизонтальные разделители `---` между релизами', () => {
    const entries = parseReleaseNotes(FIXTURE);
    for (const entry of entries) {
      // Проверяем построчно: ни одной строки, состоящей ровно из ---.
      const lines = entry.contentMd.split('\n');
      expect(lines.some((l) => /^---\s*$/.test(l))).toBe(false);
    }
  });

  it('findReleaseNotesByVersion возвращает null для несуществующей версии', () => {
    const entries = parseReleaseNotes(FIXTURE);
    expect(findReleaseNotesByVersion(entries, '9.9.9')).toBeNull();
    expect(findReleaseNotesByVersion(entries, 'v9.9.9')).toBeNull();
  });

  it('findReleaseNotesByVersion находит запись и принимает префикс `v`', () => {
    const entries = parseReleaseNotes(FIXTURE);
    expect(findReleaseNotesByVersion(entries, '1.1.5')?.version).toBe('1.1.5');
    expect(findReleaseNotesByVersion(entries, 'v1.1.5')?.version).toBe('1.1.5');
  });

  it('контент СОХРАНЯЕТ секции «Решение:» и «Эффект:»', () => {
    const entries = parseReleaseNotes(FIXTURE);
    for (const entry of entries) {
      expect(entry.contentMd).toMatch(/Решение:/);
      expect(entry.contentMd).toMatch(/Эффект:/);
    }
    expect(entries[0]?.contentMd).toMatch(/Убрать белую обводку у номеров/);
    expect(entries[0]?.contentMd).toMatch(/Цифры рулонов на схеме читаются/);
    expect(entries[1]?.contentMd).toMatch(/В ResultCard заменить нативный tooltip/);
    expect(entries[1]?.contentMd).toMatch(/Заголовок режима визуально маркирован/);
  });

  it('возвращает пустой массив при отсутствии version-заголовков', () => {
    expect(parseReleaseNotes('# No releases here')).toEqual([]);
    expect(parseReleaseNotes('')).toEqual([]);
  });

  it('сохраняет section-header `### …` в контенте', () => {
    const entries = parseReleaseNotes(FIXTURE);
    expect(entries[0]?.contentMd).toMatch(/### 🐛 Bug Fixes/);
    expect(entries[1]?.contentMd).toMatch(/### ✨ New Features/);
  });
});
