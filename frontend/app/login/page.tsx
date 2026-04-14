'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSession, saveSession } from '@/lib/auth'
import { authApi } from '@/lib/api'
import type { LoginResponse } from '@/types'
import PlaNeatLogo from '@/components/PlaNeatLogo'
import WaterCanvas from '@/components/WaterCanvas'

const REMEMBER_KEY = 'planeat_remember'

type Step = 'login' | 'forgot_phone' | 'forgot_otp' | 'forgot_reset'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('login')

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPass, setShowPass] = useState(false)

  // Forgot password state
  const [fpFirstName, setFpFirstName] = useState('')
  const [fpOtp, setFpOtp] = useState('')
  const [fpNew, setFpNew] = useState('')
  const [fpConfirm, setFpConfirm] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [devOtp, setDevOtp] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const userRef = useRef<HTMLInputElement>(null)


  useEffect(() => {
    const s = getSession()
    if (s) { router.replace('/dashboard'); return }
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) {
        const { u, p } = JSON.parse(saved)
        setUsername(u || ''); setPassword(p || ''); setRemember(true)
      }
    } catch {}
    userRef.current?.focus()
  }, [router])

  async function handleLogin() {
    if (!username.trim() || !password.trim()) { setError('กรุณากรอก Username และ Password'); return }
    setError(''); setLoading(true)
    try {
      const res = await authApi.login(username.trim(), password.trim()) as LoginResponse
      if (res.success && res.token) {
        if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ u: username.trim(), p: password.trim() }))
        else localStorage.removeItem(REMEMBER_KEY)
        saveSession({
          username: res.username!,
          name: res.name || `${res.firstName ?? ''} ${res.lastName ?? ''}`.trim() || res.username!,
          role: res.role!,
          permissions: res.permissions!,
          token: res.token,
        })
        router.replace('/dashboard')
      } else {
        setError(res.message || 'Username หรือ Password ไม่ถูกต้อง')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด กรุณาตรวจสอบการเชื่อมต่อ')
    } finally { setLoading(false) }
  }

  async function handleSendOtp() {
    if (!fpFirstName.trim()) { setError('กรุณากรอกชื่อผู้ใช้งาน หรือ ชื่อจริง'); return }
    setError(''); setLoading(true)
    try {
      const res = await authApi.forgotPassword(fpFirstName.trim()) as { success: boolean; dev_otp?: string; message?: string }
      if (res.success) {
        setDevOtp(res.dev_otp || '')
        setStep('forgot_otp')
        setSuccess('ระบบส่งรหัส OTP ไปยังอีเมลของท่านแล้ว')
      } else {
        setError(res.message || 'ไม่พบการลงทะเบียนนี้')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  async function handleVerifyOtp() {
    if (!fpOtp.trim()) { setError('กรุณากรอก OTP'); return }
    setError(''); setLoading(true)
    try {
      const res = await authApi.verifyOtp(fpFirstName.trim(), fpOtp.trim()) as { success: boolean; message?: string }
      if (res.success) { setStep('forgot_reset'); setSuccess('ยืนยัน OTP สำเร็จ') }
      else setError(res.message || 'OTP ไม่ถูกต้องหรือหมดอายุ')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  async function handleResetPassword() {
    if (!fpNew.trim()) { setError('กรุณากรอกรหัสผ่านใหม่'); return }
    if (fpNew !== fpConfirm) { setError('รหัสผ่านไม่ตรงกัน'); return }
    if (fpNew.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    setError(''); setLoading(true)
    try {
      const res = await authApi.resetPassword(fpFirstName.trim(), fpOtp.trim(), fpNew) as { success: boolean; message?: string }
      if (res.success) {
        setSuccess('เปลี่ยนรหัสผ่านสำเร็จ! กรุณาเข้าสู่ระบบ')
        setTimeout(() => { setStep('login'); setSuccess('') }, 2000)
      } else {
        setError(res.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setLoading(false) }
  }

  function resetForgot() {
    setStep('login'); setFpFirstName(''); setFpOtp(''); setFpNew(''); setFpConfirm('')
    setError(''); setSuccess(''); setDevOtp('')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }}
    >
      <div className="w-full max-w-sm mx-auto px-6 text-center relative z-10">
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <PlaNeatLogo size="lg" showText={true} />
        </div>
        <p className="text-xs mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>ระบบจัดการสำนักงาน</p>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 text-left shadow-2xl">

          {/* ── Login ── */}
          {step === 'login' && (
            <>
              <h2 className="text-base font-bold text-slate-800 mb-5">เข้าสู่ระบบ</h2>
              {error && <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>}

              <div className="mb-4">
                <label className="form-label">Username</label>
                <input ref={userRef} type="text" className="form-input" placeholder="กรอก Username"
                  value={username} onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} disabled={loading} />
              </div>

              <div className="mb-4">
                <label className="form-label">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className="form-input pr-10" placeholder="กรอก Password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()} disabled={loading} />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                    <span className="material-icons-round" style={{ fontSize: 18 }}>{showPass ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <div className="mb-5 flex items-center gap-2">
                <button type="button" onClick={() => setRemember(!remember)}
                  className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 select-none">
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ background: remember ? '#2563eb' : 'transparent', border: `2px solid ${remember ? '#2563eb' : '#cbd5e1'}` }}>
                    {remember && <span className="material-icons-round text-white" style={{ fontSize: 13 }}>check</span>}
                  </div>
                  จดจำรหัสผ่าน
                </button>
              </div>

              <button className="btn-primary w-full justify-center" onClick={handleLogin} disabled={loading}>
                {loading ? <><span className="material-icons-round spin" style={{ fontSize: 16 }}>refresh</span>กำลังเข้าสู่ระบบ...</>
                  : <><span className="material-icons-round" style={{ fontSize: 16 }}>login</span>เข้าสู่ระบบ</>}
              </button>

              {/* LINE Login */}
              <div className="mt-3 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs text-slate-400 bg-white px-2 w-fit mx-auto">หรือ</div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/api/auth/line/login`)
                    const data = await res.json()
                    if (data.url) window.location.href = data.url
                    else setError(data.detail || 'ยังไม่ได้ตั้งค่า LINE Login')
                  } catch { setError('เกิดข้อผิดพลาด') }
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ background: '#06C755' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                Login ด้วย LINE
              </button>

              <div className="mt-4 flex gap-2">
                <button onClick={() => { setStep('forgot_phone'); setError('') }}
                  className="flex-1 text-xs text-blue-600 hover:text-blue-800 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                  <span className="material-icons-round align-middle mr-1" style={{ fontSize: 14 }}>lock_reset</span>
                  ลืมรหัสผ่าน
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400">
                  ต้องการความช่วยเหลือ?{' '}
                  <span className="text-blue-500 cursor-pointer hover:underline">ติดต่อ IT Support</span>
                </p>
              </div>
            </>
          )}

          {/* ── Forgot: enter phone ── */}
          {step === 'forgot_phone' && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <button onClick={resetForgot} className="text-slate-400 hover:text-slate-600">
                  <span className="material-icons-round" style={{ fontSize: 20 }}>arrow_back</span>
                </button>
                <h2 className="text-base font-bold text-slate-800">ลืมรหัสผ่าน</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">กรอกข้อมูลยืนยันตัวตน ระบบจะส่งรหัส OTP ไปยัง<strong className="text-slate-700">อีเมล</strong>ของคุณเพื่อตั้งใหม่</p>
              {error && <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>}
              <div className="mb-5">
                <label className="form-label">ชื่อผู้ใช้งาน หรือ ชื่อจริง <span className="text-xs font-normal text-slate-400 border-none bg-transparent">(อ้างอิงตอนสมัคร)</span></label>
                <input type="text" className="form-input" placeholder="เช่น admin หรือ สมชาย"
                  value={fpFirstName} onChange={e => setFpFirstName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendOtp()} disabled={loading} />
              </div>
              <button className="btn-primary w-full justify-center" onClick={handleSendOtp} disabled={loading}>
                {loading ? <><span className="material-icons-round spin" style={{ fontSize: 16 }}>refresh</span>กำลังส่ง...</>
                  : <><span className="material-icons-round" style={{ fontSize: 16 }}>send</span>ส่ง OTP</>}
              </button>
            </>
          )}

          {/* ── Forgot: enter OTP ── */}
          {step === 'forgot_otp' && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <button onClick={() => { setStep('forgot_phone'); setError('') }} className="text-slate-400 hover:text-slate-600">
                  <span className="material-icons-round" style={{ fontSize: 20 }}>arrow_back</span>
                </button>
                <h2 className="text-base font-bold text-slate-800">ยืนยัน OTP</h2>
              </div>
              {success && <div className="mb-4 p-3 rounded-lg text-sm text-green-700" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>{success}</div>}
              {devOtp && <div className="mb-4 p-3 rounded-lg text-sm text-amber-700 font-mono" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>DEV OTP: <strong>{devOtp}</strong></div>}
              {error && <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>}
              <div className="mb-5">
                <label className="form-label">รหัส OTP (6 หลัก)</label>
                <input type="text" className="form-input text-center tracking-widest text-lg" placeholder="000000"
                  maxLength={6} value={fpOtp} onChange={e => setFpOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()} disabled={loading} />
              </div>
              <button className="btn-primary w-full justify-center" onClick={handleVerifyOtp} disabled={loading}>
                {loading ? <><span className="material-icons-round spin" style={{ fontSize: 16 }}>refresh</span>กำลังตรวจสอบ...</>
                  : <><span className="material-icons-round" style={{ fontSize: 16 }}>verified</span>ยืนยัน OTP</>}
              </button>
            </>
          )}

          {/* ── Forgot: set new password ── */}
          {step === 'forgot_reset' && (
            <>
              <h2 className="text-base font-bold text-slate-800 mb-5">ตั้งรหัสผ่านใหม่</h2>
              {success && <div className="mb-4 p-3 rounded-lg text-sm text-green-700" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>{success}</div>}
              {error && <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>{error}</div>}
              <div className="mb-4">
                <label className="form-label">รหัสผ่านใหม่</label>
                <div className="relative">
                  <input type={showNew ? 'text' : 'password'} className="form-input pr-10" placeholder="อย่างน้อย 6 ตัวอักษร"
                    value={fpNew} onChange={e => setFpNew(e.target.value)} disabled={loading} />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                    <span className="material-icons-round" style={{ fontSize: 18 }}>{showNew ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <div className="mb-5">
                <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
                <input type="password" className="form-input" placeholder="กรอกซ้ำอีกครั้ง"
                  value={fpConfirm} onChange={e => setFpConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleResetPassword()} disabled={loading} />
              </div>
              <button className="btn-primary w-full justify-center" onClick={handleResetPassword} disabled={loading}>
                {loading ? <><span className="material-icons-round spin" style={{ fontSize: 16 }}>refresh</span>กำลังบันทึก...</>
                  : <><span className="material-icons-round" style={{ fontSize: 16 }}>lock</span>บันทึกรหัสผ่านใหม่</>}
              </button>
            </>
          )}
        </div>

        <Link href="/" className="inline-flex items-center gap-1 mt-5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span className="material-icons-round" style={{ fontSize: 14 }}>arrow_back</span>
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  )
}
