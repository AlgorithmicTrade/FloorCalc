/**
 * Универсальный empty-state блок для пустых экранов (нет рулонов / помещение не задано).
 * Без отдельного CSS-модуля — стилизуется через design-tokens прямо inline.
 */

export interface EmptyStateProps {
  title: string;
  hint?: string;
}

export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div
      className="t-body"
      style={{
        padding: 'var(--space-lg)',
        textAlign: 'center',
        color: 'var(--color-ink-muted)',
      }}
    >
      <div
        className="t-card-title"
        style={{ color: 'var(--color-ink)', marginBottom: 'var(--space-xs)' }}
      >
        {title}
      </div>
      {hint && <div>{hint}</div>}
    </div>
  );
}
