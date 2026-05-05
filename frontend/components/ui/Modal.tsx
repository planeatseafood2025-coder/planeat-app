'use client'
import { useEffect, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  width?: number | string
  children: React.ReactNode
}

export default function Modal({ open, onClose, title, width = 480, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: width,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9',
          }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{title}</span>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}
            >
              <span className="material-icons-round" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>
        )}
        <div style={{ padding: title ? '16px 24px 24px' : '24px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
