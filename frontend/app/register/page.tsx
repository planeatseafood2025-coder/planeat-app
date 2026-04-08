'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    firstName: '', lastName: '', nickname: '',
    phone: '', email: '', lineId: '', jobTitle: '',
    username: '', password: '', confirmPassword: '',
  })
  const [step, setStep] = useState<'form' | 'line-otp' | 'done'>('form')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [verifyStatus, setVerifyStatus] = useState<'pending' | 'verified' | 'expired'>('pending')
  const sseRef = useRef<EventSource | null>(null)

  function set(key: keyof typeof form, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  // SSE: watch session status after LINE OTP step
  useEffect(() => {
    if (step !== 'line-otp' || !sessionId) return

    const sse = new EventSource(`${BASE_URL}/api/sse/register/${sessionId}`)
    sseRef.current = sse

    sse.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.status === 'verified') {
          setVerifyStatus('verified')
          sse.close()
          // Auto-submit after short delay
          setTimeout(() => handleRegisterWithSession(sessionId), 800)
        } else if (data.status === 'expired') {
          setVerifyStatus('expired')
          setError('รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่')
          sse.close()
        }
      } catch {}
    })

    sse.onerror = () => sse.close()

    return () => { sse.close(); sseRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId])

  async function handleRequestLineOtp() {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('กรุณากรอกชื่อ-นามสกุล'); return }
    if (!form.phone.trim()) { setError('กรุณากรอกเบอร์โทรศัพท์'); return }
    if (!form.email.trim()) { setError('กรุณากรอกอีเมล'); return }
    if (!form.username.trim()) { setError('กรุณากรอก Username'); return }
    if (form.password.length < 6) { setError('Password ต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    if (form.password !== form.confirmPassword) { setError('Password ไม่ตรงกัน'); return }
    setError(''); setLoading(true)
    try {
      const res = await authApi.requestLineOtp(form.email, form.firstName) as {
        success: boolean; sessionId?: string; otp?: string; message?: string
      }
      if (res.success && res.sessionId) {
        setSessionId(res.sessionId)
        setOtpCode(res.otp || '')
        setVerifyStatus('pending')
        setStep('line-otp')
      } else {
        setError(res.message || 'ขอรหัส OTP ไม่สำเร็จ')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  async function handleRegisterWithSession(sid: string) {
    setLoading(true); setError('')
    try {
      const res = await authApi.register({ ...form, sessionId: sid }) as { success: boolean; message?: string }
      if (res.success) setStep('done')
      else setError(res.message || 'สมัครสมาชิกไม่สำเร็จ')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }}>
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

  if (step === 'line-otp') {
    return (
      <div className="min-h-screen flex items-center justify-center py-8"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #06b6d4 100%)' }}>
        <div className="w-full max-w-sm mx-auto px-6 text-center">
          <div className="bg-white rounded-2xl p-6 shadow-2xl">

            {verifyStatus === 'verified' ? (
              <>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: '#d1fae5' }}>
                  <span className="material-icons-round text-green-600" style={{ fontSize: 32 }}>check_circle</span>
                </div>
                <h2 className="text-base font-bold text-slate-800 mb-2">ยืนยันสำเร็จ!</h2>
                <p className="text-sm text-slate-500">กำลังดำเนินการสมัครสมาชิก...</p>
                <div className="mt-4 flex justify-center">
                  <span className="material-icons-round spin text-blue-500" style={{ fontSize: 28 }}>refresh</span>
                </div>
              </>
            ) : (
              <>
                {/* LINE icon */}
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: '#06C755' }}>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.105.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                </div>

                <h2 className="text-base font-bold text-slate-800 mb-1">ยืนยันตัวตนผ่าน LINE</h2>
                <p className="text-xs text-slate-500 mb-4">
                  ส่งรหัสนี้ไปที่ LINE OA ของระบบ<br />เพื่อยืนยันตัวตนของคุณ
                </p>

                {/* OTP Display */}
                <div className="rounded-xl p-4 mb-4" style={{ background: '#f0fdf4', border: '2px dashed #86efac' }}>
                  <p className="text-xs text-green-700 mb-1 font-medium">รหัส OTP ของคุณ</p>
                  <div className="text-3xl font-bold tracking-[0.3em] text-green-800 font-mono">
                    {otpCode}
                  </div>
                  <p className="text-xs text-green-600 mt-1">มีอายุ 10 นาที</p>
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-lg text-sm text-red-700"
                    style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>
                )}

                {/* Instructions */}
                <div className="text-left space-y-2 mb-5">
                  {[
                    'เปิดแอป LINE บนมือถือ',
                    'ค้นหา LINE OA ของระบบ PlaNeat',
                    `พิมพ์รหัส "${otpCode}" แล้วส่ง`,
                    'รอระบบยืนยันโดยอัตโนมัติ',
                  ].map((txt, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: '#0ea5e9', marginTop: 1 }}>{i + 1}</span>
                      <span className="text-sm text-slate-600">{txt}</span>
                    </div>
                  ))}
                </div>

                {/* Waiting indicator */}
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 mb-4">
                  <span className="material-icons-round spin" style={{ fontSize: 18, color: '#0ea5e9' }}>refresh</span>
                  รอการยืนยันจาก LINE...
                </div>

                <button className="text-sm text-slate-400 hover:text-slate-600"
                  onClick={() => { sseRef.current?.close(); setStep('form'); setError('') }}>
                  กลับไปแก้ไขข้อมูล
                </button>
              </>
            )}
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
            <div className="mb-4 p-3 rounded-lg text-sm text-red-700"
              style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>
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

          <div className="mb-3">
            <label className="form-label">อีเมล <span className="text-red-500">*</span></label>
            <input type="email" className="form-input" placeholder="example@domain.com"
              value={form.email} onChange={e => set('email', e.target.value)} disabled={loading} />
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
              value={form.username}
              onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
              disabled={loading} />
          </div>

          <div className="mb-3">
            <label className="form-label">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} className="form-input pr-10"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={form.password} onChange={e => set('password', e.target.value)} disabled={loading} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}>
                <span className="material-icons-round" style={{ fontSize: 18 }}>
                  {showPass ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <div className="mb-5">
            <label className="form-label">ยืนยัน Password <span className="text-red-500">*</span></label>
            <input type="password" className="form-input" placeholder="กรอก Password อีกครั้ง"
              value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRequestLineOtp()} disabled={loading} />
          </div>

          <button className="btn-primary w-full justify-center" onClick={handleRequestLineOtp} disabled={loading}
            style={{ background: '#06C755', borderColor: '#06C755' }}>
            {loading
              ? <><span className="material-icons-round spin" style={{ fontSize: 16 }}>refresh</span>กำลังขอ OTP...</>
              : <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="white" style={{ flexShrink: 0 }}>
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.105.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  ยืนยันตัวตนผ่าน LINE OA
                </>}
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
