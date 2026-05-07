import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import styles from './TextInput.module.css';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ invalid, className = '', ...rest }, ref) => (
    <input
      ref={ref}
      className={`${styles.input} ${invalid ? styles.invalid : ''} t-body ${className}`}
      {...rest}
    />
  ),
);

TextInput.displayName = 'TextInput';
