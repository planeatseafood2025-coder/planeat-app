/**
 * API client — replaces callAPI() from JS_Core.html.
 * All requests go to FastAPI backend at NEXT_PUBLIC_API_URL.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = sessionStorage.getItem('planeat_user')
    if (saved) {
      const user = JSON.parse(saved)
      return user.token || null
    }
  } catch {}
  return null
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  let url = `${BASE_URL}${path}`
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params)
    url += `?${qs.toString()}`
  }

  const token = getToken()
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Network error' }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ─── Auth ────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    request('POST', '/api/auth/login', { username, password }),
}

// ─── Expenses ────────────────────────────────────────────────────
export const expenseApi = {
  getExpenses: (monthYear?: string) =>
    request('GET', '/api/expenses', undefined, monthYear ? { monthYear } : {}),
  saveExpense: (payload: unknown) =>
    request('POST', '/api/expenses', payload),
  fixData: () =>
    request('POST', '/api/admin/fix-data'),
}

// ─── Budget ──────────────────────────────────────────────────────
export const budgetApi = {
  getBudget: (monthYear?: string) =>
    request('GET', '/api/budget', undefined, monthYear ? { monthYear } : {}),
  setBudget: (payload: unknown) =>
    request('POST', '/api/budget', payload),
}

// ─── Analysis ────────────────────────────────────────────────────
export const analysisApi = {
  getAnalysis: (monthYear?: string) =>
    request('GET', '/api/analysis', undefined, monthYear ? { monthYear } : {}),
}

// ─── Users ───────────────────────────────────────────────────────
export const usersApi = {
  getUsers: () => request('GET', '/api/users'),
}

// ─── Health ──────────────────────────────────────────────────────
export const healthApi = {
  ping: () => request('GET', '/api/health'),
}
