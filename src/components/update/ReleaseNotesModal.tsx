/**
 * Модальное окно «Что нового в vX.Y.Z», показываемое единоразово
 * после обновления версии приложения. Контент — markdown из
 * `RELEASE_NOTES.md` (без секций «Изменения:»).
 *
 * Безопасность: пользовательский markdown НЕ попадает в
 * `dangerouslySetInnerHTML`. Мини-парсер строит React-элементы из
 * проparsed-структуры (h3 / ul / li / p со span'ами bold/italic/code) —
 * любой HTML escape'ится естественным способом через React.
 *
 * UX:
 *   - Закрытие по Escape, клику на backdrop, кнопке «Закрыть».
 *   - Focus автоматически переводится на кнопку «Закрыть» при mount,
 *     возвращается на previous activeElement при unmount.
 *   - ARIA: role="dialog", aria-modal, aria-labelledby.
 */

import { useEffect, useMemo, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/design-system/Button';
import styles from './ReleaseNotesModal.module.css';

export interface ReleaseNotesModalProps {
  /** Заголовок версии: «v1.1.5». */
  version: string;
  /** Дата релиза или null. */
  releasedOn: string | null;
  /** Markdown-контент. Рендерится через мини-парсер ниже. */
  contentMd: string;
  /** Закрытие — родитель отвечает за persist «больше не показывать». */
  onClose: () => void;
}

/* === Мини-markdown-парсер ====================================================
 *
 * Поддерживаемые конструкции (минимально достаточно для RELEASE_NOTES.md):
 *   - `### header`               → <h3>
 *   - `- bullet`                 → <ul><li>
 *   - параграф (любая иная строка) → <p>
 *   - `**bold**`                 → <strong>
 *   - `*italic*`                 → <em>
 *   - `` `code` ``               → <code>
 *
 * Парсер двухпроходный: блочные структуры (h3 / ul / p) → inline-токены
 * внутри текста. React-элементы строятся напрямую — без HTML-строки и
 * без dangerouslySetInnerHTML.
 */

type InlineNode = string | { type: 'strong' | 'em' | 'code'; text: string };

/** Inline-парсер: разбивает строку на массив текста и форматных токенов. */
function parseInline(text: string): InlineNode[] {
  // Порядок regex имеет значение: code раньше bold/italic чтобы
  // содержимое внутри backtick'ов не расщеплялось дальше.
  // Жадности нет: используем non-greedy `(.+?)`.
  const parts: InlineNode[] = [];
  let rest = text;

  // Используем общий regex, который матчит ЛЮБОЙ из 3 inline-форматов.
  // group 1 = code, 2 = bold, 3 = italic.
  const re = /`([^`]+)`|\*\*([^*]+?)\*\*|\*([^*]+?)\*/g;
  let lastIndex = 0;
  for (const m of rest.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > lastIndex) parts.push(rest.slice(lastIndex, idx));
    if (m[1] !== undefined) parts.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) parts.push({ type: 'strong', text: m[2] });
    else if (m[3] !== undefined) parts.push({ type: 'em', text: m[3] });
    lastIndex = idx + m[0].length;
  }
  if (lastIndex < rest.length) parts.push(rest.slice(lastIndex));
  return parts;
}

/** Рендерит inline-узлы в массив React-элементов. */
function renderInline(nodes: readonly InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}-${i}`;
    if (typeof n === 'string') return <span key={key}>{n}</span>;
    if (n.type === 'strong') return <strong key={key}>{n.text}</strong>;
    if (n.type === 'em') return <em key={key}>{n.text}</em>;
    return <code key={key}>{n.text}</code>;
  });
}

type Block =
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'p'; lines: string[] };

/**
 * Блочный парсер: построчно собирает h3 / ul / p.
 * Подбуллеты «Решение:» и «Эффект:» в RELEASE_NOTES.md имеют отступ 2
 * пробела + текст (`  Решение:`) — рендерим как короткий параграф.
 * Bullet'ы (`  - …` и `- …`) сворачиваем в один `ul`.
 */
function parseBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const line = raw.trimEnd();
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    // h3.
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3 && h3[1]) {
      blocks.push({ type: 'h3', text: h3[1].trim() });
      i += 1;
      continue;
    }
    // bullet (` - ` либо `- `, любой отступ).
    const bullet = /^\s*-\s+(.+)$/.exec(line);
    if (bullet && bullet[1]) {
      const items: string[] = [bullet[1].trim()];
      i += 1;
      while (i < lines.length) {
        const next = (lines[i] ?? '').trimEnd();
        const m = /^\s*-\s+(.+)$/.exec(next);
        if (!m || !m[1]) break;
        items.push(m[1].trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    // параграф: соединяем подряд идущие непустые строки, не являющиеся bullet/h3.
    const paraLines: string[] = [line.trim()];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? '').trimEnd();
      if (next.trim() === '') break;
      if (/^###\s+/.test(next)) break;
      if (/^\s*-\s+/.test(next)) break;
      paraLines.push(next.trim());
      i += 1;
    }
    blocks.push({ type: 'p', lines: paraLines });
  }
  return blocks;
}

function renderMarkdown(md: string): ReactNode[] {
  const blocks = parseBlocks(md);
  return blocks.map((b, i) => {
    const key = `b${i}`;
    if (b.type === 'h3') return <h3 key={key}>{renderInline(parseInline(b.text), key)}</h3>;
    if (b.type === 'ul') {
      return (
        <ul key={key}>
          {b.items.map((item, j) => (
            <li key={`${key}-${j}`}>{renderInline(parseInline(item), `${key}-${j}`)}</li>
          ))}
        </ul>
      );
    }
    // p: каждая строка — на новой строке через <br/> для сохранения форматирования.
    return (
      <p key={key}>
        {b.lines.map((ln, j) => (
          <span key={`${key}-${j}`}>
            {renderInline(parseInline(ln), `${key}-${j}`)}
            {j < b.lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>
    );
  });
}

/* === Компонент =============================================================*/

const closeBtnStyle: CSSProperties = { minWidth: 96 };

export function ReleaseNotesModal({
  version,
  releasedOn,
  contentMd,
  onClose,
}: ReleaseNotesModalProps) {
  const titleId = 'release-notes-title';
  const closeBtnId = 'release-notes-close';

  // Memoize рендер markdown — пересборка только при смене contentMd.
  const rendered = useMemo(() => renderMarkdown(contentMd), [contentMd]);

  /* Focus management + Escape handler. */
  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null;
    // Ставим focus на кнопку «Закрыть» — это «безопасное» действие
    // для пользователя, нажавшего Enter/Space сразу после показа.
    const btn = document.getElementById(closeBtnId);
    if (btn instanceof HTMLElement) btn.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Возвращаем focus на previously focused элемент — стандартная
      // практика для модального dialog.
      previousActive?.focus?.();
    };
  }, [onClose]);

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>): void => {
    // Закрытие только если клик именно по backdrop, а не по карточке.
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Что нового в {version}
          </h2>
          {releasedOn ? <span className={styles.date}>{releasedOn}</span> : null}
        </div>
        <div className={styles.body}>{rendered}</div>
        <div className={styles.footer}>
          <Button
            id={closeBtnId}
            variant="accent"
            onClick={onClose}
            style={closeBtnStyle}
          >
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}
