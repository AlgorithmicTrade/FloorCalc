import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

interface Tab {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  /** правый слот для дополнительных контролов, например «+» add-button */
  endSlot?: ReactNode;
}

export function Tabs({ tabs, activeId, onChange, endSlot }: TabsProps) {
  return (
    <div className={styles.row} role="tablist">
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`${styles.tab} ${isActive ? styles.active : ''} t-button`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
      {endSlot && <div className={styles.end}>{endSlot}</div>}
    </div>
  );
}
