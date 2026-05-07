import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

type Surface = 'surface-1' | 'surface-2';
type Padding = 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  surface?: Surface;
  padding?: Padding;
  children?: ReactNode;
}

function padClass(p: Padding): string {
  if (p === 'sm') return styles.padSm ?? '';
  if (p === 'md') return styles.padMd ?? '';
  return styles.padLg ?? '';
}

function surfaceClass(s: Surface): string {
  if (s === 'surface-2') return styles.surface2 ?? '';
  return styles.surface1 ?? '';
}

export function Card({
  surface = 'surface-1',
  padding = 'lg',
  children,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={`${styles.card} ${surfaceClass(surface)} ${padClass(padding)} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
