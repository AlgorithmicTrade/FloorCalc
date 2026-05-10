import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReleaseNotes, findReleaseNotesByVersion } from '../../src/lib/releaseNotes';

/**
 * Sanity-test на реальном RELEASE_NOTES.md в репозитории.
 * Проверяет что парсер не ломается на текущем формате, и что для
 * каждой записи нет утечки технических секций «Изменения:» и footer'ов.
 *
 * Это smoke-тест на формат — НЕ контракт на конкретные версии,
 * чтобы релизный workflow не ломал тесты при добавлении новых записей.
 */
describe('parseReleaseNotes on real RELEASE_NOTES.md', () => {
  const raw = readFileSync(resolve(__dirname, '../../RELEASE_NOTES.md'), 'utf8');
  const entries = parseReleaseNotes(raw);

  it('находит хотя бы одну запись', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('каждая запись имеет валидную semver-версию', () => {
    for (const e of entries) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('ни в одной записи нет СЕКЦИИ «Изменения:», footer или горизонталей', () => {
    for (const e of entries) {
      // Проверяем именно header секции (`^  Изменения:` с отступом), а не любое
      // вхождение слова «Изменения:» в обычном тексте — оно может встретиться
      // в bullet'ах внутри «Решение:» / «Эффект:» (например, «без блока „Изменения:"»).
      const hasChangesSection = e.contentMd
        .split('\n')
        .some((l) => /^ {2}Изменения:\s*$/.test(l));
      expect(hasChangesSection).toBe(false);
      expect(e.contentMd).not.toMatch(/automatically generated/);
      expect(e.contentMd.split('\n').some((l) => /^---\s*$/.test(l))).toBe(false);
    }
  });

  it('запись для текущей версии (top entry) имеет «Решение:» и «Эффект:»', () => {
    const top = entries[0];
    expect(top).toBeDefined();
    if (!top) return;
    // Top-entry, как правило, новейший релиз — для него ожидаем секции.
    expect(top.contentMd).toMatch(/Решение:/);
    expect(top.contentMd).toMatch(/Эффект:/);
  });

  it('findReleaseNotesByVersion возвращает entry для top-версии', () => {
    const top = entries[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(findReleaseNotesByVersion(entries, top.version)?.version).toBe(top.version);
  });
});
