/**
 * Toast-баннер статусов автоапдейтера. Подписывается на updateStore.
 *
 * `idle`/`checking`/`not-available` — баннер скрыт; UI без update-шумов
 * по умолчанию. `available` сбрасывает `isDismissed` (см. updateStore).
 */

import { Button } from '@/components/design-system/Button';
import { useUpdateStore } from '@/store/updateStore';
import styles from './UpdateBanner.module.css';

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const isDismissed = useUpdateStore((s) => s.isDismissed);
  const triggerDownload = useUpdateStore((s) => s.triggerDownload);
  const triggerInstall = useUpdateStore((s) => s.triggerInstall);
  const dismiss = useUpdateStore((s) => s.dismiss);

  if (isDismissed) return null;
  if (status.kind === 'idle' || status.kind === 'checking' || status.kind === 'not-available') {
    return null;
  }

  if (status.kind === 'available') {
    return (
      <div className={styles.banner} role="status">
        <div className={styles.title}>Доступна версия {status.next}</div>
        <div className={styles.body}>
          Установлена {status.current}. Скачать обновление?
        </div>
        <div className={styles.actions}>
          <Button variant="accent" onClick={() => void triggerDownload()}>
            Скачать
          </Button>
          <Button variant="tertiary" onClick={dismiss}>
            Позже
          </Button>
        </div>
      </div>
    );
  }

  if (status.kind === 'downloading') {
    const pct = Math.max(0, Math.min(100, Math.round(status.percent)));
    return (
      <div className={styles.banner} role="status">
        <div className={styles.title}>Скачивание обновления</div>
        <div className={styles.body}>{pct}%</div>
        <div className={styles.progressOuter}>
          <div className={styles.progressInner} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (status.kind === 'ready') {
    return (
      <div className={styles.banner} role="status">
        <div className={styles.title}>Обновление готово</div>
        <div className={styles.body}>Версия {status.next} установится после перезапуска.</div>
        <div className={styles.actions}>
          <Button variant="accent" onClick={() => void triggerInstall()}>
            Установить и перезапустить
          </Button>
          <Button variant="tertiary" onClick={dismiss}>
            Позже
          </Button>
        </div>
      </div>
    );
  }

  // status.kind === 'error'
  return (
    <div className={`${styles.banner} ${styles.error}`} role="alert">
      <div className={styles.title}>Ошибка обновления</div>
      <div className={styles.body}>{status.message}</div>
      <div className={styles.actions}>
        <Button variant="tertiary" onClick={dismiss}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}
