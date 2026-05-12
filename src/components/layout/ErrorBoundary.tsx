/**
 * Корневой ErrorBoundary. Ловит unhandled exception в дочернем дереве,
 * рендерит fallback на --color-surface-1 фоне и предлагает кнопку
 * «Перезагрузить страницу». Без него React 19 при необработанной ошибке
 * рендера отрывает всё дерево от #root, оставляя голый чёрный body
 * (фон body — --color-canvas: #000000).
 *
 * Class-component обязателен: error-boundary API (componentDidCatch /
 * getDerivedStateFromError) в hooks недоступен.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card } from '@/components/design-system/Card';
import { Button } from '@/components/design-system/Button';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    /* В web-сборке доступен только DevTools-console пользователя —
       пишем туда для дальнейшего bug-report. Sentry/file-logging нет. */
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] render exception', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message ?? 'Неизвестная ошибка';

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-lg)',
          background: 'var(--color-canvas)',
        }}
      >
        <Card surface="surface-1" padding="lg" style={{ maxWidth: '520px', width: '100%' }}>
          <div
            className="t-card-title"
            style={{ color: 'var(--color-ink)', marginBottom: 'var(--space-sm)' }}
          >
            Что-то пошло не так
          </div>
          <div
            className="t-body"
            style={{ color: 'var(--color-ink-muted)', marginBottom: 'var(--space-md)' }}
          >
            Интерфейс встретил необработанную ошибку и не может продолжить работу.
            Попробуйте перезагрузить страницу.
          </div>
          <pre
            className="t-body"
            style={{
              color: 'var(--color-ink-muted)',
              background: 'var(--color-surface-2)',
              padding: 'var(--space-sm)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              overflow: 'auto',
              maxHeight: '160px',
              marginBottom: 'var(--space-md)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message}
          </pre>
          <Button variant="primary" onClick={this.handleReload}>
            Перезагрузить страницу
          </Button>
        </Card>
      </div>
    );
  }
}
