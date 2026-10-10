import clsx from 'clsx'
import { X } from 'lucide-react'
import { useToastStore } from '../lib/toast'

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismissToast = useToastStore((state) => state.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={clsx(
            'pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg',
            toast.variant === 'error'
              ? 'border-rose-200 bg-white text-rose-900'
              : 'border-slate-200 bg-white text-slate-800',
          )}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="shrink-0 font-semibold text-indigo-600 hover:text-indigo-800"
              onClick={() => {
                toast.action?.onClick()
                dismissToast(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss notification"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => dismissToast(toast.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
