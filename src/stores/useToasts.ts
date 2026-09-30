import { create } from 'zustand';
import { friendlyError } from '../lib/errors';

export type ToastKind = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Optional second line with something the user can do about it. */
  action?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, action?: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, action) => {
    const id = nextId++;
    // Cap the stack so a failing refetch loop cannot bury the screen.
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, action }].slice(-4) }));
    if (kind !== 'error') {
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Reports an error to the user as a plain-English toast.
 */
export function notifyError(err: unknown, fallback?: string): void {
  useToasts.getState().push('error', friendlyError(err, fallback));
}

export function notifySuccess(message: string): void {
  useToasts.getState().push('success', message);
}
