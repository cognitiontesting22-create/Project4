import { create } from 'zustand'

export type ToastVariant = 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastMessage {
  id: string
  message: string
  variant: ToastVariant
  action?: ToastAction
}

interface ToastState {
  toasts: ToastMessage[]
  showToast: (toast: Omit<ToastMessage, 'id'>) => string
  dismissToast: (id: string) => void
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()
let nextId = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  showToast: (toast) => {
    const id = `toast-${++nextId}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    timers.set(id, setTimeout(() => get().dismissToast(id), 4000))
    return id
  },
  dismissToast: (id) => {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
}))
