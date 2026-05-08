/**
 * Двухколонный shell приложения: слева 380px (каталог рулонов),
 * справа — основная область (вкладки помещений + результаты).
 *
 * Footer-слот опционален — туда можно положить status-bar или
 * глобальный banner; в MVP не используется (`UpdateBanner` —
 * fixed-overlay, рендерится отдельно в App.tsx).
 *
 * sidebarCollapsed — пробрасывается из App.tsx; при true левая колонка
 * сворачивается до нулевой ширины (grid-template-columns: 0 1fr).
 * Кнопка-тоггл рендерится в App.tsx поверх shell как fixed-overlay.
 */

import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

export interface AppShellProps {
  left: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
  sidebarCollapsed?: boolean;
}

export function AppShell({ left, right, footer, sidebarCollapsed = false }: AppShellProps) {
  return (
    <div className={`${styles.shell}${sidebarCollapsed ? ` ${styles.shellCollapsed}` : ''}`}>
      <aside
        id="sidebar-aside"
        className={styles.left}
        aria-hidden={sidebarCollapsed}
      >
        {left}
      </aside>
      <main className={styles.right}>{right}</main>
      {footer}
    </div>
  );
}
