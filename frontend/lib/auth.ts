import type { User } from '@/types'

const SESSION_KEY = 'planeat_user'

export function getSession(): User | null {
  if (typeof window === 'undefined') return null
  const saved = sessionStorage.getItem(SESSION_KEY)
  if (!saved) return null
  try {
    return JSON.parse(saved) as User
  } catch {
    return null
  }
}

export function saveSession(user: User): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
