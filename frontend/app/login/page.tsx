'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSession, saveSession } from '@/lib/auth'
import { authApi } from '@/lib/api'
import type { LoginResponse } from '@/types'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const userRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const s = getSession()
    if (s) router.replace('/dashboard')
    userRef.current?.focus()
  }, [router])

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('กรุณากรอก Username และ Password')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(username.trim(), password.trim()) as LoginResponse
      if (res.success && res.token) {
        saveSession({
          username: res.username!,
          name: res.name!,
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
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0ea5e9 100%)' }}
    >
      <div className="w-full max-w-sm mx-auto px-6 text-center">
        {/* Logo */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.2)' }}
        >
          <span className="material-icons-round text-white" style={{ fontSize: 32 }}>
            corporate_fare
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">PlaNeat Support</h1>
        <p className="text-xs mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>ระบบจัดการสำนักงาน</p>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 text-left shadow-2xl">
          <h2 className="text-base font-bold text-slate-800 mb-5">เข้าสู่ระบบ</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="form-label">Username</label>
            <input
              ref={userRef}
              type="text"
              className="form-input"
              placeholder="กรอก Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
          </div>

          <div className="mb-6">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="กรอก Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
          </div>

          <button
            className="btn-primary w-full justify-center"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="material-icons-round spin" style={{ fontSize: 16 }}>refresh</span>
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              <>
                <span className="material-icons-round" style={{ fontSize: 16 }}>login</span>
                เข้าสู่ระบบ
              </>
            )}
          </button>
        </div>

        <Link href="/" className="inline-flex items-center gap-1 mt-5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span className="material-icons-round" style={{ fontSize: 14 }}>arrow_back</span>
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  )
}
