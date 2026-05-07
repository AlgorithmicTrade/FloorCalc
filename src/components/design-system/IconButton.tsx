import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  children: ReactNode;
  /** обязательно для a11y — кнопка содержит только иконку */
  ariaLabel: string;
}

export function IconButton({
  size = 'md',
  children,
  ariaLabel,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={`${styles.btn} ${styles[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
