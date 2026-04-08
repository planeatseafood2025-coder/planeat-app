'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    firstName: '', lastName: '', nickname: '',
    phone: '', lineId: '', jobTitle: '',
    username: '', password: '', confirmPassword: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  function set(key: keyof typeof form, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('กรุณากรอกชื่อ-นามสกุล'); return }
    if (!form.phone.trim()) { setError('กรุณากรอกเบอร์โทรศัพท์'); return }
    if (!form.username.trim()) { setError('กรุณากรอก Username'); return }
    if (form.password.length < 6) { setError('Password ต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    if (form.password !== form.confirmPassword) { setError('Password ไม่ตรงกัน'); return }
    setError(''); setLoading(true)
    try {
      const res = await authApi.register(form) as { success: boolean; message?: string }
      if (res.success) setDone(true)
      else setError(res.message || 'สมัครสมาชิกไม่สำเร็จ')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0ea5e9 100%)' }}>
        <div className="w-full max-w-sm mx-auto px-6 text-center">
          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: '#d1fae5' }}>
              <span className="material-icons-round text-green-600" style={{ fontSize: 36 }}>check_circle</span>
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">สมัครสมาชิกสำเร็จ!</h2>
            <p className="text-sm text-slate-500 mb-6">
              บัญชีของคุณอยู่ในระหว่างรอการอนุมัติจากทีม IT<br />
              กรุณารอการแจ้งเตือนก่อนเข้าสู่ระบบ
            </p>
            <button className="btn-primary w-full justify-center" onClick={() => router.push('/login')}>
              <span className="material-icons-round" style={{ fontSize: 16 }}>login</span>
              กลับหน้าเข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0ea5e9 100%)' }}>
      <div className="w-full max-w-md mx-auto px-6">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.2)' }}>
            <span className="material-icons-round text-white" style={{ fontSize: 28 }}>corporate_fare</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">PlaNeat Support</h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>สมัครสมาชิก — บัญชีใหม่จะรอการอนุมัติจาก IT</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h2 className="text-base font-bold text-slate-800 mb-4">ข้อมูลส่วนตัว</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>
          )}

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label">ชื่อ <span className="text-red-500">*</span></label>
              <input type="text" className="form-input" placeholder="ชื่อจริง"
                value={form.firstName} onChange={e => set('firstName', e.target.value)} disabled={loading} />
            </div>
            <div>
              <label className="form-label">นามสกุล <span className="text-red-500">*</span></label>
              <input type="text" className="form-input" placeholder="นามสกุล"
                value={form.lastName} onChange={e => set('lastName', e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label">ชื่อเล่น</label>
            <input type="text" className="form-input" placeholder="ชื่อเล่น (ถ้ามี)"
              value={form.nickname} onChange={e => set('nickname', e.target.value)} disabled={loading} />
          </div>

          <div className="mb-3">
            <label className="form-label">เบอร์โทรศัพท์ <span className="text-red-500">*</span></label>
            <input type="tel" className="form-input" placeholder="0812345678"
              value={form.phone} onChange={e => set('phone', e.target.value)} disabled={loading} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label">Line ID</label>
              <input type="text" className="form-input" placeholder="Line ID (ถ้ามี)"
                value={form.lineId} onChange={e => set('lineId', e.target.value)} disabled={loading} />
            </div>
            <div>
              <label className="form-label">ตำแหน่งงาน</label>
              <input type="text" className="form-input" placeholder="ตำแหน่ง"
                value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className="border-t border-slate-100 my-4 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">ข้อมูลเข้าสู่ระบบ</h3>
          </div>

          <div className="mb-3">
            <label className="form-label">Username <span className="text-red-500">*</span></label>
            <input type="text" className="form-input" placeholder="ตั้ง Username สำหรับเข้าสู่ระบบ"
              value={form.username} onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))} disabled={loading} />
          </div>

          <div className="mb-3">
            <label className="form-label">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} className="form-input pr-10" placeholder="อย่างน้อย 6 ตัวอักษร"
                value={form.password} onChange={e => set('password', e.target.value)} disabled={loading} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                <span className="material-icons-round" style={{ fontSize: 18 }}>{showPass ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

          <div className="mb-5">
            <label className="form-label">ยืนยัน Password <span className="text-red-500">*</span></label>
            <input type="password" className="form-input" placeholder="กรอก Password อีกครั้ง"
              value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} disabled={loading} />
          </div>

          <button className="btn-primary w-full justify-center" onClick={handleSubmit} disabled={loading}>
            {loading
              ? <><span className="material-icons-round spin" style={{ fontSize: 16 }}>refresh</span>กำลังสมัคร...</>
              : <><span className="material-icons-round" style={{ fontSize: 16 }}>person_add</span>สมัครสมาชิก</>}
          </button>

          <p className="text-center text-xs text-slate-500 mt-4">
            มีบัญชีแล้ว?{' '}
            <Link href="/login" className="text-blue-600 hover:underline">เข้าสู่ระบบ</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
