'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, action ? 5000 : 3000); // longer timeout when there's an action button
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg
              ${t.type === 'success' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : ''}
              ${t.type === 'error' ? 'bg-red-950 text-red-300 border border-red-800' : ''}
              ${t.type === 'info' ? 'bg-gray-900 text-gray-200 border border-gray-700' : ''}
            `}
          >
            {t.type === 'success' && (
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {t.type === 'error' && (
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span
              className={t.action ? '' : 'cursor-pointer'}
              onClick={t.action ? undefined : () => removeToast(t.id)}
            >
              {t.message}
            </span>
            {t.action && (
              <>
                <span className="text-gray-600">|</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    t.action!.onClick();
                    removeToast(t.id);
                  }}
                  className="font-semibold text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
                >
                  {t.action.label}
                </button>
              </>
            )}
            <button
              onClick={() => removeToast(t.id)}
              className="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
