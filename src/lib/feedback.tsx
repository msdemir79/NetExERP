import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from './utils';

export type FeedbackType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  type: FeedbackType;
  message: string;
}

interface ConfirmRequest {
  id: number;
  message: string;
  title: string;
  confirmText: string;
  cancelText: string;
  tone: 'danger' | 'default';
  resolve: (ok: boolean) => void;
}

let toastSeq = 0;
const toastListeners = new Set<(t: ToastItem) => void>();

export function showToast(message: unknown, type: FeedbackType = 'info'): void {
  const text = String(message ?? '').trim();
  if (!text) return;
  const item: ToastItem = { id: ++toastSeq, type, message: text };
  toastListeners.forEach((listener) => listener(item));
}

let confirmSeq = 0;
const confirmListeners = new Set<(r: ConfirmRequest) => void>();

export function confirmDialog(
  message: string,
  opts?: Partial<Pick<ConfirmRequest, 'title' | 'confirmText' | 'cancelText' | 'tone'>>
): Promise<boolean> {
  return new Promise((resolve) => {
    if (confirmListeners.size === 0) {
      resolve(window.confirm(message));
      return;
    }
    const req: ConfirmRequest = {
      id: ++confirmSeq,
      message,
      title: opts?.title ?? 'Onay Gerekli',
      confirmText: opts?.confirmText ?? 'Onayla',
      cancelText: opts?.cancelText ?? 'Vazgeç',
      tone: opts?.tone ?? 'danger',
      resolve,
    };
    confirmListeners.forEach((listener) => listener(req));
  });
}

const TOAST_STYLES: Record<FeedbackType, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'border-emerald-200 dark:border-emerald-500/30', iconColor: 'text-emerald-500' },
  error: { icon: XCircle, ring: 'border-rose-200 dark:border-rose-500/30', iconColor: 'text-rose-500' },
  warning: { icon: AlertTriangle, ring: 'border-amber-200 dark:border-amber-500/30', iconColor: 'text-amber-500' },
  info: { icon: Info, ring: 'border-slate-200 dark:border-slate-700', iconColor: 'text-indigo-500' },
};

export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setToasts((prev) => [...prev.slice(-4), t]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 4200);
    };
    toastListeners.add(onToast);
    return () => {
      toastListeners.delete(onToast);
    };
  }, []);

  useEffect(() => {
    const onConfirm = (r: ConfirmRequest) => setConfirmReq(r);
    confirmListeners.add(onConfirm);
    return () => {
      confirmListeners.delete(onConfirm);
    };
  }, []);

  useEffect(() => {
    if (!confirmReq) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        confirmReq.resolve(false);
        setConfirmReq(null);
      } else if (e.key === 'Enter') {
        confirmReq.resolve(true);
        setConfirmReq(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmReq]);

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  const answer = (ok: boolean) => {
    confirmReq?.resolve(ok);
    setConfirmReq(null);
  };

  const confirmTone = confirmReq?.tone ?? 'danger';
  const ConfirmIcon = TOAST_STYLES[confirmTone === 'danger' ? 'warning' : 'info'].icon;

  return (
    <>
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] pointer-events-none print:hidden">
        {toasts.map((t) => {
          const style = TOAST_STYLES[t.type];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-white dark:bg-slate-900 shadow-lg shadow-slate-900/5 px-3.5 py-3',
                style.ring
              )}
              style={{ animation: 'feedbackSlideIn 180ms ease-out' }}
              role="status"
            >
              <Icon className={cn('w-4.5 h-4.5 shrink-0 mt-px', style.iconColor)} />
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed flex-1 break-words">
                {t.message}
              </p>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm leading-none shrink-0 -mr-0.5"
                aria-label="Bildirimi kapat"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {confirmReq && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px] print:hidden"
          onMouseDown={() => answer(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-4"
            style={{ animation: 'feedbackPopIn 150ms ease-out' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                  confirmTone === 'danger'
                    ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                )}
              >
                <ConfirmIcon className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{confirmReq.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-line">
                  {confirmReq.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => answer(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {confirmReq.cancelText}
              </button>
              <button
                type="button"
                onClick={() => answer(true)}
                autoFocus
                className={cn(
                  'px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-colors',
                  confirmTone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                )}
              >
                {confirmReq.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
