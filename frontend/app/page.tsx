'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import PlaNeatLogo from '@/components/PlaNeatLogo'

export default function LandingPage() {
  const router = useRouter()

  useEffect(() => {
    const session = getSession()
    if (session) router.replace('/dashboard')
  }, [router])

  return (
    <div className="landing-page" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }}>
      <div className="w-full max-w-sm mx-auto px-6 text-center" style={{ position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <PlaNeatLogo size="lg" showText={false} />
        </div>

        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">PlaNeat Support</h1>
        <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.55)' }}>
          ระบบจัดการสำนักงาน v2.0
        </p>

        {/* Main CTA — ไปที่ LINE Login standalone โดยตรง */}
        <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/api/auth/line/standalone-start`} className="block mb-4">
          <button className="landing-btn-main">
            <span className="material-icons-round" style={{ fontSize: 24 }}>edit_note</span>
            บันทึกข้อมูลประจำวัน
          </button>
        </a>

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
