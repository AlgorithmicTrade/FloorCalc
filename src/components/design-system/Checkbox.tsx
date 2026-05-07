import type { InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', ...rest }, ref) => (
    <label className={`${styles.wrapper} ${className}`}>
      <input ref={ref} type="checkbox" className={styles.input} {...rest} />
      <span className={styles.box} aria-hidden="true">
        <svg className={styles.check} viewBox="0 0 16 16" width="12" height="12">
          <path
            d="M3 8l3 3 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label !== undefined && label !== null && <span className={styles.label}>{label}</span>}
    </label>
  ),
);

Checkbox.displayName = 'Checkbox';
