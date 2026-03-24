'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'

export default function LandingPage() {
  const router = useRouter()

  useEffect(() => {
    const session = getSession()
    if (session) router.replace('/dashboard')
  }, [router])

  return (
    <div className="landing-page">
      <div className="w-full max-w-sm mx-auto px-6 text-center">
        {/* Logo */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style={{ background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.2)' }}
        >
          <span className="material-icons-round text-white" style={{ fontSize: 40 }}>
            corporate_fare
          </span>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">PlaNeat Support</h1>
        <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.55)' }}>
          ระบบจัดการสำนักงาน v2.0
        </p>

        {/* Main CTA */}
        <Link href="/standalone" className="block mb-4">
          <button className="landing-btn-main">
            <span className="material-icons-round" style={{ fontSize: 24 }}>edit_note</span>
            บันทึกข้อมูลประจำวัน
          </button>
        </Link>

        {/* Secondary CTA */}
        <Link href="/login">
          <button className="landing-btn-secondary">
            <span className="material-icons-round" style={{ fontSize: 16 }}>login</span>
            เข้าสู่ระบบสำนักงาน
          </button>
        </Link>

        <p className="mt-10 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          PlaNeat Support © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
