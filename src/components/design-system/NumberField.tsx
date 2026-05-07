import { useState, useEffect, useCallback, type FocusEvent, type ChangeEvent } from 'react';
import { TextInput, type TextInputProps } from './TextInput';
import styles from './NumberField.module.css';

export interface NumberFieldProps
  extends Omit<TextInputProps, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  /** значение в миллиметрах (integer) */
  valueMm: number;
  /** колбэк с миллиметрами (integer, округлено до 1 мм) */
  onChangeMm: (mm: number) => void;
  /** default 0 */
  minMm?: number;
  /** default 100_000 (100 м) */
  maxMm?: number;
  /** шаг в метрах для UI step= (default 0.01) */
  stepM?: number;
  /** suffix отображается визуально (например, «м»), не часть значения */
  suffix?: string;
}

const mmToText = (mm: number): string => (mm / 1000).toFixed(2);

export function NumberField({
  valueMm,
  onChangeMm,
  minMm = 0,
  maxMm = 100_000,
  stepM = 0.01,
  suffix,
  className = '',
  onBlur,
  ...rest
}: NumberFieldProps) {
  const [text, setText] = useState<string>(() => mmToText(valueMm));

  // Sync external valueMm → text (если изменилось извне).
  useEffect(() => {
    setText((prev) => {
      const prevMm = Math.round(parseFloat(prev) * 1000);
      // если текст не парсится как число — всегда обновляем; иначе только если значения разные
      if (Number.isNaN(prevMm) || prevMm !== valueMm) {
        return mmToText(valueMm);
      }
      return prev;
    });
  }, [valueMm]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
  }, []);

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      const parsed = parseFloat(text);
      let mm: number;
      if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
        mm = valueMm; // некорректный ввод — откат к текущему значению
      } else {
        mm = Math.round(parsed * 1000);
        if (mm < minMm) mm = minMm;
        if (mm > maxMm) mm = maxMm;
      }
      // Синхронизируем текст с округлённым значением
      setText(mmToText(mm));
      if (mm !== valueMm) {
        onChangeMm(mm);
      }
      onBlur?.(e);
    },
    [text, valueMm, minMm, maxMm, onChangeMm, onBlur],
  );

  const input = (
    <TextInput
      type="number"
      inputMode="decimal"
      lang="en"
      step={stepM}
      min={minMm / 1000}
      max={maxMm / 1000}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      className={suffix ? styles.inputWithSuffix : ''}
      {...rest}
    />
  );

  if (!suffix) {
    return <div className={`${styles.wrapper} ${className}`}>{input}</div>;
  }

  return (
    <div className={`${styles.wrapper} ${styles.hasSuffix} ${className}`}>
      {input}
      <span className={styles.suffix} aria-hidden="true">
        {suffix}
      </span>
    </div>
  );
}
