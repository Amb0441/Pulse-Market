import React from 'react';

/** Catches render errors so a bug shows a message instead of a white screen,
 * and logs the error with its component stack to the console. */
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // The only place a render crash is logged; the fix belongs in the component
    // that threw.
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="h-screen grid place-items-center bg-paper px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-sand grid place-items-center mb-4">
            <svg
              className="w-7 h-7 text-clay"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>

          <h1 className="font-display text-xl font-bold text-ink">Something broke on this screen</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Your account is fine and nothing was lost. Try again, and if it keeps happening a
            reload usually clears it.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={this.reset}
              className="h-11 px-5 rounded-lg bg-clay hover:bg-clay-hover text-white font-semibold text-sm transition-colors touch-manipulation focus-ring active:scale-[0.98]"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="h-11 px-5 rounded-lg border border-ink font-semibold text-sm text-ink hover:bg-sand transition-colors touch-manipulation focus-ring active:scale-[0.98]"
            >
              Reload
            </button>
          </div>

          <details className="mt-6 text-left">
            <summary className="text-xs text-ink-soft cursor-pointer select-none">
              Technical details
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-sand text-[11px] text-ink overflow-x-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
