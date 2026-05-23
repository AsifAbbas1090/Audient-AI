/**
 * Two-step delete control for non-locked sessions (matches AdminPage / app theme).
 */
import { useState } from 'react'
import { Trash2, Check, X, Lock } from 'lucide-react'
import { cn } from '../utils/cn'
import { Button } from './ui/Button'
import api from '../lib/api'

type Variant = 'card' | 'header'

interface DeleteSessionControlProps {
  sessionId: string
  sessionTitle?: string | null
  /** Approved = locked — hide delete for clinicians */
  locked: boolean
  canDelete: boolean
  onDeleted: () => void
  onError?: (message: string) => void
  variant?: Variant
}

export function DeleteSessionControl({
  sessionId,
  sessionTitle,
  locked,
  canDelete,
  onDeleted,
  onError,
  variant = 'card',
}: DeleteSessionControlProps) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (locked || !canDelete) {
    if (locked && variant === 'header') {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 light:text-slate-600 px-2"
          title="Approved records are locked"
        >
          <Lock size={12} className="text-emerald-500" />
          Locked
        </span>
      )
    }
    return null
  }

  async function handleConfirmDelete() {
    setDeleting(true)
    try {
      await api.delete(`/api/conversations/${sessionId}`)
      setConfirming(false)
      onDeleted()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Could not delete session'
      onError?.(msg)
      setConfirming(false)
    } finally {
      setDeleting(false)
    }
  }

  if (variant === 'header') {
    if (confirming) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 light:text-slate-600 hidden sm:inline max-w-[140px] truncate">
            Delete permanently?
          </span>
          <Button
            variant="destructive"
            size="sm"
            loading={deleting}
            onClick={() => void handleConfirmDelete()}
          >
            <Check size={13} />
            Confirm
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => setConfirming(false)}
          >
            <X size={13} />
            Cancel
          </Button>
        </div>
      )
    }
    return (
      <Button
        variant="secondary"
        size="sm"
        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/25 light:text-red-600 light:hover:bg-red-50 light:hover:border-red-200"
        onClick={() => setConfirming(true)}
        title="Delete session permanently"
      >
        <Trash2 size={13} />
        Delete
      </Button>
    )
  }

  // Card variant — icon buttons on dashboard tiles
  return (
    <div
      className="flex items-center gap-0.5 shrink-0"
      onClick={e => e.preventDefault()}
      onKeyDown={e => e.stopPropagation()}
      role="presentation"
    >
      {confirming ? (
        <>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleConfirmDelete()}
            className={cn(
              'p-1.5 rounded-lg text-red-400 hover:bg-red-500/15 transition-colors',
              'disabled:opacity-50',
            )}
            title="Confirm delete"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirming(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-colors"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cn(
            'p-1.5 rounded-lg text-slate-500 opacity-0 group-hover:opacity-100',
            'hover:text-red-400 hover:bg-red-500/10 transition-all',
            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40',
          )}
          title={
            sessionTitle
              ? `Delete "${sessionTitle}" permanently`
              : 'Delete session permanently'
          }
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}
