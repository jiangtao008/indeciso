import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { cn } from '../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  wide?: boolean
  footer?: ReactNode
  closeOnBackdrop?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
  footer,
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={cn('modal-panel', wide && 'modal-wide')}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {(title || subtitle) && (
          <div className="modal-head">
            <div>
              {title && <h2 className="modal-title">{title}</h2>}
              {subtitle && <p className="modal-sub">{subtitle}</p>}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="关闭"
              onClick={onClose}
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} closeOnBackdrop={!busy}>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        {message}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={cn('btn', danger ? 'btn-danger' : 'btn-primary')}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && <Icon name="refresh" size={14} className="spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
