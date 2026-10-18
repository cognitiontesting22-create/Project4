import { useToastStore } from './toast'
import { useAppStore } from '../store/useAppStore'

export function undoWithToast() {
  const label = useAppStore.getState().undo()
  if (!label) return
  useToastStore.getState().showToast({
    message: `Undid: ${label}`,
    variant: 'info',
    action: { label: 'Redo', onClick: redoWithToast },
  })
}

export function redoWithToast() {
  const label = useAppStore.getState().redo()
  if (!label) return
  useToastStore.getState().showToast({
    message: `Redid: ${label}`,
    variant: 'info',
    action: { label: 'Undo', onClick: undoWithToast },
  })
}
