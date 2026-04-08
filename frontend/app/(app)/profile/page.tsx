'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { profileApi } from '@/lib/api'
import { getSession, saveSession } from '@/lib/auth'
import type { User, UserPermissions } from '@/types'
import { ROLE_LABELS } from '@/types'

type Tab = 'info' | 'photo' | 'signature' | 'permissions'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>('info')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Info form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [lineId, setLineId] = useState('')
  const [lineNotifyToken, setLineNotifyToken] = useState('')
  const [jobTitle, setJobTitle] = useState('')

  // Signature
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [signMode, setSignMode] = useState<'draw' | 'upload'>('draw')
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Permissions
  const [permReason, setPermReason] = useState('')
  const [reqPerms, setReqPerms] = useState<UserPermissions>({ labor: false, raw: false, chem: false, repair: false })

  useEffect(() => {
    profileApi.getMe().then((res: unknown) => {
      const r = res as { user?: User }
      if (r.user) {
        setUser(r.user)
        setFirstName(r.user.firstName || '')
        setLastName(r.user.lastName || '')
        setNickname(r.user.nickname || '')
        setPhone(r.user.phone || '')
        setLineId(r.user.lineId || '')
        setLineNotifyToken((r.user as User & { lineNotifyToken?: string }).lineNotifyToken || '')
        setJobTitle(r.user.jobTitle || '')
      }
    }).catch(() => {
      const s = getSession()
      if (s) {
        setUser(s)
        setFirstName(s.firstName || '')
        setLastName(s.lastName || '')
        setNickname(s.nickname || '')
        setPhone(s.phone || '')
        setLineId(s.lineId || '')
        setJobTitle(s.jobTitle || '')
      }
    })
  }, [])

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  // ── Info save ────────────────────────────────────────────────────
  async function saveInfo() {
    setSaving(true)
    try {
      await profileApi.updateMe({ firstName, lastName, nickname, phone, lineId, lineNotifyToken, jobTitle })
      // Update session
      const s = getSession()
      if (s) {
        const displayName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || s.username)
        saveSession({ ...s, firstName, lastName, nickname, phone, lineId, jobTitle, name: displayName })
        setUser(prev => prev ? { ...prev, firstName, lastName, nickname, phone, lineId, jobTitle, name: displayName } : prev)
      }
      flash('ok', 'บันทึกข้อมูลสำเร็จ')
    } catch (e: unknown) {
      flash('err', (e as Error).message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  // ── Photo upload ─────────────────────────────────────────────────
  function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) { flash('err', 'กรุณาเลือกไฟล์ภาพ'); return }
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      // Resize to max 400px
      const img = new Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const max = 400
        const ratio = Math.min(max / img.width, max / img.height, 1)
        canvas.width = img.width * ratio
        canvas.height = img.height * ratio
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const b64 = canvas.toDataURL('image/jpeg', 0.85)
        // Check size ~500KB base64
        if (b64.length > 700000) { flash('err', 'ภาพมีขนาดใหญ่เกินไป (สูงสุด 500KB)'); return }
        setSaving(true)
        try {
          await profileApi.updatePhoto(b64)
          const s = getSession()
          if (s) saveSession({ ...s, profilePhoto: b64 })
          setUser(prev => prev ? { ...prev, profilePhoto: b64 } : prev)
          flash('ok', 'อัปโหลดรูปโปรไฟล์สำเร็จ')
        } catch (err: unknown) {
          flash('err', (err as Error).message || 'เกิดข้อผิดพลาด')
        } finally { setSaving(false) }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  async function deletePhoto() {
    setSaving(true)
    try {
      await profileApi.deletePhoto()
      const s = getSession()
      if (s) { const ns = { ...s }; delete ns.profilePhoto; saveSession(ns) }
      setUser(prev => prev ? { ...prev, profilePhoto: undefined } : prev)
      flash('ok', 'ลบรูปโปรไฟล์แล้ว')
    } catch (e: unknown) {
      flash('err', (e as Error).message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  // ── Signature canvas ─────────────────────────────────────────────
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    const m = e as React.MouseEvent
    return { x: (m.clientX - rect.left) * scaleX, y: (m.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current!
    const pos = getPos(e, canvas)
    setIsDrawing(true)
    lastPos.current = pos
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }
    lastPos.current = pos
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    setIsDrawing(false)
    lastPos.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  async function saveDrawnSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    // Check if canvas is empty
    const ctx = canvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const hasContent = data.some((v, i) => i % 4 === 3 && v > 0)
    if (!hasContent) { flash('err', 'กรุณาเขียนลายเซ็นก่อน'); return }
    const b64 = canvas.toDataURL('image/png')
    await uploadSignature(b64)
  }

  function handleSignatureFile(file: File) {
    if (file.type !== 'image/png') { flash('err', 'กรุณาใช้ไฟล์ PNG เท่านั้น'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        // Check background: sample corners, allow transparent or white/near-white
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const corners = [
          ctx.getImageData(0, 0, 1, 1).data,
          ctx.getImageData(img.width - 1, 0, 1, 1).data,
          ctx.getImageData(0, img.height - 1, 1, 1).data,
          ctx.getImageData(img.width - 1, img.height - 1, 1, 1).data,
        ]
        for (const c of corners) {
          const [r, g, b, a] = [c[0], c[1], c[2], c[3]]
          const isTransparent = a < 30
          const isWhite = r > 230 && g > 230 && b > 230
          if (!isTransparent && !isWhite) {
            flash('err', 'ไฟล์ลายเซ็นต้องมีพื้นหลังโปร่งใส (transparent) หรือพื้นสีขาวเท่านั้น')
            return
          }
        }
        uploadSignature(dataUrl)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const uploadSignature = useCallback(async (b64: string) => {
    setSaving(true)
    try {
      await profileApi.updateSignature(b64)
      const s = getSession()
      if (s) saveSession({ ...s, signature: b64 })
      setUser(prev => prev ? { ...prev, signature: b64 } : prev)
      flash('ok', 'บันทึกลายเซ็นสำเร็จ')
      clearCanvas()
    } catch (e: unknown) {
      flash('err', (e as Error).message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }, [])

  async function deleteSignature() {
    setSaving(true)
    try {
      await profileApi.deleteSignature()
      const s = getSession()
      if (s) { const ns = { ...s }; delete ns.signature; saveSession(ns) }
      setUser(prev => prev ? { ...prev, signature: undefined } : prev)
      flash('ok', 'ลบลายเซ็นแล้ว')
    } catch (e: unknown) {
      flash('err', (e as Error).message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  // ── Permission request ────────────────────────────────────────────
  async function requestPermissions() {
    if (!Object.values(reqPerms).some(Boolean)) { flash('err', 'กรุณาเลือกสิทธิ์ที่ต้องการ'); return }
    setSaving(true)
    try {
      await profileApi.requestPermission(reqPerms as unknown as Record<string, boolean>, permReason)
      flash('ok', 'ส่งคำขอสิทธิ์แล้ว ระบบจะแจ้งเตือนผู้จัดการไอที')
      setReqPerms({ labor: false, raw: false, chem: false, repair: false })
      setPermReason('')
    } catch (e: unknown) {
      flash('err', (e as Error).message || 'เกิดข้อผิดพลาด')
    } finally { setSaving(false) }
  }

  if (!user) return (
    <div className="flex items-center justify-center" style={{ minHeight: 300 }}>
      <span className="material-icons-round spin text-blue-500" style={{ fontSize: 36 }}>refresh</span>
    </div>
  )

  const tabStyle = (t: Tab) => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: tab === t ? '#2563eb' : 'transparent',
    color: tab === t ? 'white' : '#64748b',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  const CAT_LABELS: Record<string, string> = { labor: 'ค่าแรงงาน', raw: 'ค่าวัตถุดิบ', chem: 'ค่าเคมี/หีบห่อ', repair: 'ค่าซ่อมแซม' }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Flash message */}
      {msg && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 10,
          background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'ok' ? '#166534' : '#991b1b',
          fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>
            {msg.type === 'ok' ? 'check_circle' : 'error'}
          </span>
          {msg.text}
        </div>
      )}

      {/* Profile header card */}
      <div style={{ background: 'white', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {user.profilePhoto ? (
            <img src={user.profilePhoto} alt="avatar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e2e8f0' }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #e2e8f0' }}>
              <span className="material-icons-round" style={{ fontSize: 36, color: '#2563eb' }}>person</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name}</h2>
          {user.jobTitle && <p style={{ margin: '2px 0', fontSize: 13, color: '#64748b' }}>{user.jobTitle}</p>}
          <span style={{
            display: 'inline-block', marginTop: 4, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: '#eff6ff', color: '#2563eb'
          }}>{ROLE_LABELS[user.role] ?? user.role}</span>
        </div>
        <div style={{ textAlign: 'right', color: '#94a3b8', fontSize: 12 }}>
          <p style={{ margin: 0 }}>@{user.username}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: 12, borderBottom: '1px solid #f1f5f9', overflowX: 'auto' }}>
          <button style={tabStyle('info')} onClick={() => setTab('info')}>ข้อมูลส่วนตัว</button>
          <button style={tabStyle('photo')} onClick={() => setTab('photo')}>รูปโปรไฟล์</button>
          <button style={tabStyle('signature')} onClick={() => setTab('signature')}>ลายเซ็น</button>
          <button style={tabStyle('permissions')} onClick={() => setTab('permissions')}>ขอสิทธิ์เพิ่มเติม</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* ── Info Tab ── */}
          {tab === 'info' && (
            <div>
              <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>แก้ไขข้อมูลส่วนตัว</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: 'ชื่อ', val: firstName, set: setFirstName },
                  { label: 'นามสกุล', val: lastName, set: setLastName },
                  { label: 'ชื่อเล่น', val: nickname, set: setNickname },
                  { label: 'เบอร์โทร', val: phone, set: setPhone },
                  { label: 'Line ID (ชื่อแสดงผล)', val: lineId, set: setLineId },
                  { label: 'ตำแหน่งงาน', val: jobTitle, set: setJobTitle },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>{label}</label>
                    <input
                      type="text"
                      value={val}
                      onChange={e => set(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>

              {/* LINE Notify Token */}
              <div style={{ marginTop: 16, padding: 16, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>
                  LINE Notify Token (สำหรับรับแจ้งเตือนส่วนตัว)
                </label>
                <input
                  type="text"
                  value={lineNotifyToken}
                  onChange={e => setLineNotifyToken(e.target.value)}
                  placeholder="วาง token ที่ได้จาก notify-bot.line.me..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #86efac', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'white' }}
                />
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#16a34a' }}>
                  วิธีรับ Token: ไปที่ notify-bot.line.me → เข้าสู่ระบบ → "สร้าง token" → เลือก "1:1" → คัดลอก token มาวางที่นี่
                </p>
              </div>
              <button
                onClick={saveInfo}
                disabled={saving}
                style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, background: '#2563eb', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </div>
          )}

          {/* ── Photo Tab ── */}
          {tab === 'photo' && (
            <div>
              <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>รูปโปรไฟล์</h3>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                {user.profilePhoto ? (
                  <img src={user.profilePhoto} alt="profile" style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e2e8f0' }} />
                ) : (
                  <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #e2e8f0' }}>
                    <span className="material-icons-round" style={{ fontSize: 56, color: '#2563eb' }}>person</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ padding: '8px 20px', borderRadius: 10, background: '#2563eb', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    <span className="material-icons-round" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>upload</span>
                    เลือกรูปภาพ
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handlePhotoFile(e.target.files[0])} />
                  </label>
                  {user.profilePhoto && (
                    <button
                      onClick={deletePhoto}
                      disabled={saving}
                      style={{ padding: '8px 20px', borderRadius: 10, background: '#fee2e2', color: '#dc2626', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}
                    >
                      <span className="material-icons-round" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>delete</span>
                      ลบรูป
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>รองรับ JPG, PNG, GIF · ขนาดสูงสุด 500KB</p>
              </div>
            </div>
          )}

          {/* ── Signature Tab ── */}
          {tab === 'signature' && (
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>ลายเซ็นของฉัน</h3>
              <p style={{ margin: '0 0 20px', fontSize: 12, color: '#94a3b8' }}>ลายเซ็นจะใช้สำหรับเซ็นเอกสารในระบบ</p>

              {/* Current signature */}
              {user.signature && (
                <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#475569' }}>ลายเซ็นปัจจุบัน</p>
                  <img src={user.signature} alt="signature" style={{ maxHeight: 80, maxWidth: '100%', display: 'block' }} />
                  <button
                    onClick={deleteSignature}
                    disabled={saving}
                    style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <span className="material-icons-round" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>delete</span>
                    ลบลายเซ็น
                  </button>
                </div>
              )}

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['draw', 'upload'] as const).map(m => (
                  <button key={m} onClick={() => setSignMode(m)}
                    style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: signMode === m ? '#1e293b' : 'white', color: signMode === m ? 'white' : '#475569' }}>
                    <span className="material-icons-round" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>{m === 'draw' ? 'edit' : 'upload_file'}</span>
                    {m === 'draw' ? 'เขียนลายเซ็น' : 'อัปโหลดไฟล์'}
                  </button>
                ))}
              </div>

              {signMode === 'draw' && (
                <div>
                  <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: 'white', touchAction: 'none' }}>
                    <canvas
                      ref={canvasRef}
                      width={640}
                      height={200}
                      style={{ width: '100%', height: 200, cursor: 'crosshair', display: 'block' }}
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={endDraw}
                      onMouseLeave={endDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={endDraw}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button onClick={clearCanvas}
                      style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
                      ล้าง
                    </button>
                    <button onClick={saveDrawnSignature} disabled={saving}
                      style={{ padding: '8px 20px', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'กำลังบันทึก...' : 'บันทึกลายเซ็น'}
                    </button>
                  </div>
                </div>
              )}

              {signMode === 'upload' && (
                <div>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, border: '2px dashed #cbd5e1', borderRadius: 12, cursor: 'pointer', gap: 10, background: '#f8fafc' }}>
                    <span className="material-icons-round" style={{ fontSize: 36, color: '#94a3b8' }}>upload_file</span>
                    <p style={{ margin: 0, fontWeight: 600, color: '#475569', fontSize: 14 }}>เลือกไฟล์ PNG</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>ต้องเป็น PNG ที่มีพื้นหลังโปร่งใสหรือพื้นสีขาวเท่านั้น</p>
                    <input type="file" accept="image/png" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleSignatureFile(e.target.files[0])} />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ── Permissions Tab ── */}
          {tab === 'permissions' && (
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>ขอสิทธิ์การเข้าถึงเพิ่มเติม</h3>
              <p style={{ margin: '0 0 20px', fontSize: 12, color: '#94a3b8' }}>คำขอจะถูกส่งไปยังผู้จัดการไอทีเพื่อพิจารณาอนุมัติ</p>

              {/* Current permissions */}
              <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', borderRadius: 12 }}>
                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#475569' }}>สิทธิ์ปัจจุบัน</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(CAT_LABELS).map(([k, l]) => {
                    const has = user.permissions?.[k as keyof UserPermissions]
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span className="material-icons-round" style={{ fontSize: 16, color: has ? '#16a34a' : '#dc2626' }}>
                          {has ? 'check_circle' : 'cancel'}
                        </span>
                        <span style={{ color: has ? '#15803d' : '#b91c1c' }}>{l}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <p style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12 }}>เลือกสิทธิ์ที่ต้องการขอ</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {Object.entries(CAT_LABELS).map(([k, l]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${reqPerms[k as keyof UserPermissions] ? '#2563eb' : '#e2e8f0'}`, cursor: 'pointer', background: reqPerms[k as keyof UserPermissions] ? '#eff6ff' : 'white', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={reqPerms[k as keyof UserPermissions]}
                      onChange={e => setReqPerms(prev => ({ ...prev, [k]: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: '#2563eb' }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{l}</span>
                  </label>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>เหตุผลในการขอสิทธิ์</label>
                <textarea
                  value={permReason}
                  onChange={e => setPermReason(e.target.value)}
                  placeholder="อธิบายเหตุผลที่ต้องการสิทธิ์เพิ่มเติม..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <button
                onClick={requestPermissions}
                disabled={saving}
                style={{ padding: '10px 24px', borderRadius: 10, background: '#2563eb', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span className="material-icons-round" style={{ fontSize: 16 }}>notifications_active</span>
                {saving ? 'กำลังส่งคำขอ...' : 'ส่งคำขอสิทธิ์'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
