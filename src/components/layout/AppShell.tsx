/**
 * Двухколонный shell приложения: слева 380px (каталог рулонов),
 * справа — основная область (вкладки помещений + результаты).
 *
 * Footer-слот опционален — туда можно положить status-bar или
 * глобальный banner; в MVP не используется (`UpdateBanner` —
 * fixed-overlay, рендерится отдельно в App.tsx).
 */

import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

export interface AppShellProps {
  left: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
}

export function AppShell({ left, right, footer }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <aside className={styles.left}>{left}</aside>
      <main className={styles.right}>{right}</main>
      {footer}
    </div>
  );
}
