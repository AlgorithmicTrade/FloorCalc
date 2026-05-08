/**
 * Banner уведомления о новой версии. Web-реализация: показывается, когда
 * `useUpdateStore` обнаружил, что `version.json` на сервере отличается от
 * текущей сборки. Кнопка «Обновить» делает `location.reload()`, кнопка
 * «Позже» прячет banner до следующего изменения версии.
 */

import { Button } from '@/components/design-system/Button';
import { useUpdateStore } from '@/store/updateStore';
import styles from './UpdateBanner.module.css';

export function UpdateBanner() {
  const current = useUpdateStore((s) => s.current);
  const next = useUpdateStore((s) => s.next);
  const isDismissed = useUpdateStore((s) => s.isDismissed);
  const dismiss = useUpdateStore((s) => s.dismiss);

  if (!next || isDismissed) return null;

  return (
    <div className={styles.banner} role="status">
      <div className={styles.title}>Доступна версия {next}</div>
      <div className={styles.body}>
        Установлена {current}. Обновите страницу, чтобы загрузить новую сборку.
      </div>
      <div className={styles.actions}>
        <Button variant="accent" onClick={() => location.reload()}>
          Обновить
        </Button>
        <Button variant="tertiary" onClick={dismiss}>
          Позже
        </Button>
      </div>
    </div>
  );
}
