'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { saveSession } from '@/lib/auth'
import PlaNeatLogo from '@/components/PlaNeatLogo'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

type Step = 'loading' | 'new_user' | 'pending' | 'error'

function LineCallbackContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep]   = useState<Step>('loading')
  const [error, setError] = useState('')
  const [tempId, setTempId]           = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pictureUrl, setPictureUrl]   = useState('')

  // ── ฟอร์มกรอกข้อมูลเพิ่มเติม ──
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [nickname, setNickname]   = useState('')
  const [jobTitle, setJobTitle]   = useState('')
  const [phone, setPhone]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const code  = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code || !state) {
      setError('ไม่พบข้อมูลจาก LINE กรุณาลองใหม่อีกครั้ง')
      setStep('error')
      return
    }

    fetch(`${API_BASE}/api/auth/line/callback?code=${code}&state=${state}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success') {
          saveSession({
            username:    data.username,
            name:        data.name,
            role:        data.role,
            permissions: data.permissions,
            token:       data.token,
          })
          router.replace('/dashboard')
        } else if (data.status === 'new_user') {
          setTempId(data.tempId)
          setDisplayName(data.displayName || '')
          setPictureUrl(data.pictureUrl || '')
          setFirstName('')
          setLastName('')
          setStep('new_user')
        } else if (data.status === 'pending') {
          setStep('pending')
        } else if (data.status === 'suspended') {
          setError(data.message || 'บัญชีถูกระงับ')
          setStep('error')
        } else {
          setError(data.detail || data.message || 'เกิดข้อผิดพลาด')
          setStep('error')
        }
      })
      .catch(() => {
        setError('เกิดข้อผิดพลาดในการเชื่อมต่อ')
        setStep('error')
      })
  }, [])

  async function handleComplete() {
    if (!firstName.trim()) { setFormError('กรุณากรอกชื่อ'); return }
    if (!phone.trim())     { setFormError('กรุณากรอกเบอร์โทรศัพท์'); return }

    setSaving(true)
    setFormError('')
    try {
      const res = await fetch(`${API_BASE}/api/auth/line/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: tempId, firstName, lastName, nickname, jobTitle, phone }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setStep('pending')
      } else {
        setFormError(data.detail || data.message || 'เกิดข้อผิดพลาด')
      }
    } catch {
      setFormError('เกิดข้อผิดพลาดในการเชื่อมต่อ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }}>
      <div className="w-full max-w-sm mx-auto px-6 text-center relative z-10">
        <div className="flex justify-center mb-5">
          <PlaNeatLogo size="lg" showText={true} />
        </div>

        <div className="bg-white rounded-2xl p-6 text-left shadow-2xl">

          {/* Loading */}
          {step === 'loading' && (
            <div className="text-center py-8">
              <span className="material-icons text-4xl text-blue-500 animate-spin">sync</span>
              <p className="mt-3 text-gray-600">กำลังตรวจสอบข้อมูล LINE...</p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="text-center py-4">
              <span className="material-icons text-4xl text-red-500">error_outline</span>
              <p className="mt-3 text-red-600 font-medium">{error}</p>
              <button onClick={() => router.replace('/login')}
                className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">
                กลับหน้า Login
              </button>
            </div>
          )}

          {/* Pending */}
          {step === 'pending' && (
            <div className="text-center py-4">
              <span className="material-icons text-5xl text-yellow-500">hourglass_top</span>
              <h2 className="mt-3 font-bold text-gray-800">รอการอนุมัติ</h2>
              <p className="mt-2 text-sm text-gray-500">ทีม IT กำลังตรวจสอบบัญชีของคุณ<br />จะได้รับการแจ้งเตือนเมื่ออนุมัติแล้ว</p>
              <button onClick={() => router.replace('/login')}
                className="mt-5 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium">
                กลับหน้า Login
              </button>
            </div>
          )}

          {/* New User Form */}
          {step === 'new_user' && (
            <>
              <div className="flex items-center gap-3 mb-5">
                {pictureUrl && (
                  <img src={pictureUrl} alt="LINE" className="w-12 h-12 rounded-full object-cover" />
                )}
                <div>
                  <h2 className="font-bold text-gray-800">ยินดีต้อนรับ!</h2>
                  <p className="text-xs text-gray-500">{displayName}</p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4">กรอกข้อมูลเพิ่มเติมเพื่อสมัครสมาชิก</p>

              {formError && (
                <div className="mb-3 p-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200">
                  {formError}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อ *</label>
                    <input value={firstName} onChange={e => setFirstName(e.target.value)}
                      autoComplete="off" name="given-name-new"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="ชื่อจริง" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">นามสกุล</label>
                    <input value={lastName} onChange={e => setLastName(e.target.value)}
                      autoComplete="off" name="family-name-new"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="นามสกุล" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อเล่น</label>
                  <input value={nickname} onChange={e => setNickname(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="ชื่อเล่น (ถ้ามี)" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">ตำแหน่งงาน</label>
                  <input value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                    autoComplete="off"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="เช่น พนักงานบัญชี, วิศวกร" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">เบอร์โทรศัพท์ *</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} type="tel"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="0812345678" />
                </div>
              </div>

              <button onClick={handleComplete} disabled={saving}
                className="mt-5 w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {saving
                  ? <><span className="material-icons text-base animate-spin">sync</span>กำลังส่งข้อมูล...</>
                  : <><span className="material-icons text-base">send</span>ส่งคำขอสมัครสมาชิก</>}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

export default function LineCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }}>
        <span className="material-icons text-4xl text-white animate-spin">sync</span>
      </div>
    }>
      <LineCallbackContent />
    </Suspense>
  )
}
