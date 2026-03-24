'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, saveSession, clearSession } from '@/lib/auth'
import { invalidateCache } from '@/lib/cache'
import { authApi } from '@/lib/api'
import type { User, LoginResponse } from '@/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const saved = getSession()
    setUser(saved)
    setLoading(false)
  }, [])

  async function login(username: string, password: string): Promise<{ success: boolean; message?: string }> {
    const res = await authApi.login(username, password) as LoginResponse
    if (res.success && res.token) {
      const u: User = {
        username: res.username!,
        name: res.name!,
        role: res.role!,
        permissions: res.permissions!,
        token: res.token,
      }
      saveSession(u)
      setUser(u)
      return { success: true }
    }
    return { success: false, message: res.message || 'เข้าสู่ระบบไม่สำเร็จ' }
  }

  function logout() {
    clearSession()
    invalidateCache('*')
    setUser(null)
    router.push('/login')
  }

  return { user, loading, login, logout }
}
