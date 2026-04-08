'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, clearSession } from '@/lib/auth'
import { invalidateCache } from '@/lib/cache'
import Sidebar from '@/components/layout/Sidebar'
import type { User, Notification } from '@/types'
import { thaiLongDate } from '@/lib/utils'
import { notificationApi } from '@/lib/api'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateStr, setDateStr] = useState('')
  const router = useRouter()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [showNotif, setShowNotif] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    setUser(session)
    setDateStr(thaiLongDate())
    setLoading(false)
  }, [router])

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationApi.getAll() as { notifications?: Notification[]; unread?: number }
      setNotifications(res.notifications || [])
      setUnread(res.unread || 0)
    } catch {}
  }, [])

  useEffect(() => {
    if (!user) return
    // โหลดครั้งแรกทันที (fallback กรณี SSE ยังไม่เชื่อม)
    loadNotifications()
    // เชื่อม SSE แทน polling
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const es = new EventSource(`/api/sse/notifications?token=${encodeURIComponent(token)}`)
    es.addEventListener('notification', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        setNotifications(data.notifications || [])
        setUnread(data.unread || 0)
      } catch {}
    })
    es.onerror = () => {
      // SSE error → fallback to polling ทุก 30s
      es.close()
      const id = setInterval(loadNotifications, 30000)
      sseRef.current = null
      return () => clearInterval(id)
    }
    sseRef.current = es
    return () => { es.close(); sseRef.current = null }
  }, [user, loadNotifications])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleLogout() {
    if (typeof window === 'undefined') return
    import('sweetalert2').then(({ default: Swal }) => {
      Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ef4444',
      }).then((r) => {
        if (r.isConfirmed) {
          clearSession()
          invalidateCache('*')
          router.push('/login')
        }
      })
    })
  }

  async function markRead(id: string) {
    await notificationApi.markRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    await notificationApi.markAllRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  async function deleteNotif(id: string) {
    await notificationApi.delete(id)
    const n = notifications.find(x => x.id === id)
    setNotifications(prev => prev.filter(x => x.id !== id))
    if (n && !n.read) setUnread(prev => Math.max(0, prev - 1))
  }

  function formatNotifTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'เมื่อกี้'
    if (mins < 60) return `${mins} นาทีที่แล้ว`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`
    const days = Math.floor(hrs / 24)
    return `${days} วันที่แล้ว`
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f7fa' }}>
        <div className="text-center">
          <span className="material-icons-round spin text-blue-500" style={{ fontSize: 40 }}>refresh</span>
          <p className="mt-2 text-sm text-slate-500">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  const displayName = user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.name

  return (
    <div id="main-app" className="flex min-h-screen">
      <Sidebar user={user} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const sb = document.getElementById('sidebar')
                if (!sb) return
                if (window.innerWidth <= 768) sb.classList.toggle('mobile-open')
                else sb.classList.toggle('collapsed')
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <span className="material-icons-round" style={{ fontSize: 22 }}>menu</span>
            </button>
            <div>
              <div className="font-semibold text-slate-800 text-sm" id="page-title">ภาพรวม</div>
              <div className="text-xs text-slate-400 hidden sm:block">{dateStr}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowNotif(v => !v); setShowProfile(false) }}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: showNotif ? '#eff6ff' : '#f8fafc',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                  transition: 'background 0.15s',
                }}
              >
                <span className="material-icons-round" style={{ fontSize: 20, color: '#475569' }}>notifications</span>
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%',
                    background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white',
                  }}>{unread > 9 ? '9+' : unread}</span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotif && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, width: 360, maxHeight: 480,
                  background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                  zIndex: 1000, overflow: 'hidden', marginTop: 8,
                  border: '1px solid #f1f5f9',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>การแจ้งเตือน</span>
                      {unread > 0 && (
                        <span style={{ padding: '1px 7px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700 }}>{unread}</span>
                      )}
                    </div>
                    {unread > 0 && (
                      <button onClick={markAllRead} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        อ่านทั้งหมด
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                        <span className="material-icons-round" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>notifications_none</span>
                        <p style={{ fontSize: 13, margin: 0 }}>ไม่มีการแจ้งเตือน</p>
                      </div>
                    ) : notifications.map(n => (
                      <div key={n.id} onClick={() => !n.read && markRead(n.id)}
                        style={{
                          padding: '12px 16px', borderBottom: '1px solid #f8fafc', cursor: n.read ? 'default' : 'pointer',
                          background: n.read ? 'white' : '#f0f9ff',
                          display: 'flex', alignItems: 'flex-start', gap: 10, position: 'relative',
                        }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: n.read ? '#f1f5f9' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span className="material-icons-round" style={{ fontSize: 16, color: n.read ? '#94a3b8' : '#2563eb' }}>
                            {n.type === 'permission_request' ? 'key' : n.type === 'status_change' ? 'manage_accounts' : 'info'}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: n.read ? 500 : 700, color: '#1e293b', marginBottom: 2 }}>{n.title}</p>
                          <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{n.body}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>{formatNotifTime(n.createdAt)}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteNotif(n.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2, borderRadius: 4, flexShrink: 0 }}>
                          <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
                        </button>
                        {!n.read && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 24, background: '#2563eb', borderRadius: '0 4px 4px 0' }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Button */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowProfile(v => !v); setShowNotif(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 10,
                  border: 'none', cursor: 'pointer', background: showProfile ? '#eff6ff' : '#f8fafc',
                  transition: 'background 0.15s',
                }}
              >
                {user.profilePhoto ? (
                  <img src={user.profilePhoto} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons-round" style={{ fontSize: 16, color: '#2563eb' }}>person</span>
                  </div>
                )}
                <div className="text-right hidden sm:block">
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{displayName}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>@{user.username}</p>
                </div>
                <span className="material-icons-round hidden sm:block" style={{ fontSize: 16, color: '#94a3b8' }}>expand_more</span>
              </button>

              {/* Profile Dropdown */}
              {showProfile && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, width: 240,
                  background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                  zIndex: 1000, overflow: 'hidden', marginTop: 8,
                  border: '1px solid #f1f5f9',
                }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                    {user.profilePhoto ? (
                      <img src={user.profilePhoto} alt="avatar" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 8px', display: 'block' }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                        <span className="material-icons-round" style={{ fontSize: 28, color: '#2563eb' }}>person</span>
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{displayName}</p>
                    {user.jobTitle && <p style={{ margin: '2px 0', fontSize: 12, color: '#64748b' }}>{user.jobTitle}</p>}
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>@{user.username}</p>
                  </div>
                  <div style={{ padding: '8px' }}>
                    <button
                      onClick={() => { setShowProfile(false); router.push('/profile') }}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', gap: 10, color: '#1e293b', fontSize: 13, fontWeight: 500 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="material-icons-round" style={{ fontSize: 18, color: '#64748b' }}>manage_accounts</span>
                      แก้ไขโปรไฟล์
                    </button>
                    <button
                      onClick={() => { setShowProfile(false); router.push('/profile?tab=signature') }}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', gap: 10, color: '#1e293b', fontSize: 13, fontWeight: 500 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="material-icons-round" style={{ fontSize: 18, color: '#64748b' }}>draw</span>
                      ลายเซ็นของฉัน
                    </button>
                    <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                    <button
                      onClick={handleLogout}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', gap: 10, color: '#dc2626', fontSize: 13, fontWeight: 500 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="material-icons-round" style={{ fontSize: 18 }}>logout</span>
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
