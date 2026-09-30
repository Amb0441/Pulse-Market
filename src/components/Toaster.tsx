import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X, Info } from 'lucide-react';
import { useToasts, type Toast } from '../stores/useToasts';

const ICON = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
} as const;

const STYLE = {
  error: 'border-rose/40 bg-rose/10 text-ink',
  success: 'border-moss/40 bg-moss/10 text-ink',
  info: 'border-line bg-card text-ink',
} as const;

const ICON_STYLE = {
  error: 'text-rose',
  success: 'text-moss',
  info: 'text-clay',
} as const;

const ToastRow: React.FC<{ toast: Toast }> = ({ toast }) => {
  const dismiss = useToasts((s) => s.dismiss);
  const Icon = ICON[toast.kind];

  // Errors stay until dismissed; everything else fades after 4 seconds.
  useEffect(() => {
    if (toast.kind === 'error') return;
    const t = setTimeout(() => dismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, toast.kind, dismiss]);

  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
      className={`pointer-events-auto flex items-start gap-2.5 w-full max-w-sm rounded-xl border px-3.5 py-3 shadow-[4px_4px_0_var(--color-line)] animate-rise ${STYLE[toast.kind]}`}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${ICON_STYLE[toast.kind]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug break-words">{toast.message}</p>
        {toast.action && <p className="text-xs text-ink-soft mt-0.5">{toast.action}</p>}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="shrink-0 text-ink-soft hover:text-ink transition-colors"
        aria-label="Dismiss message"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

/** Renders queued messages. Mounted once in App, so a failed request is visible
 * in the product rather than only in the developer console. */
export const Toaster: React.FC = () => {
  const toasts = useToasts((s) => s.toasts);
  if (!toasts.length) return null;

  return (
    <div className="fixed z-[calc(var(--z-modal)+10)] bottom-4 right-4 left-4 sm:left-auto flex flex-col items-stretch sm:items-end gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
};
