import type { HTMLAttributes, ReactNode } from 'react';

export interface EyebrowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Section eyebrow (uppercase 12px / 600 / tracked) — uses `.t-eyebrow` utility
 * from `src/styles/typography.css`. No own CSS module.
 */
export function Eyebrow({ children, className = '', ...rest }: EyebrowProps) {
  return (
    <div className={`t-eyebrow ${className}`} {...rest}>
      {children}
    </div>
  );
}
