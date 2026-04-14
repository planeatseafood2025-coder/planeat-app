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
    cache: 'no-store',
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
  requestRegisterOtp: (email: string, firstName: string) =>
    request('POST', '/api/auth/request-register-otp', { email, firstName }),
  register: (payload: {
    firstName: string; lastName: string; nickname?: string
    phone: string; email: string; lineId?: string; jobTitle?: string
    username: string; password: string; confirmPassword: string
    otp?: string; sessionId?: string
  }) => request('POST', '/api/auth/register', payload),
  forgotPassword: (username: string) =>
    request('POST', '/api/auth/forgot-password', { username }),
  verifyOtp: (username: string, otp: string) =>
    request('POST', '/api/auth/verify-otp', { username, otp }),
  resetPassword: (username: string, otp: string, newPassword: string) =>
    request('POST', '/api/auth/reset-password', { username, otp, newPassword }),
}

// ─── Expenses ────────────────────────────────────────────────────
export const expenseApi = {
  getExpenses: (monthYear?: string) =>
    request('GET', '/api/expenses', undefined, monthYear ? { monthYear } : {}),
  saveExpense: (payload: unknown) =>
    request('POST', '/api/expenses', payload),
  editExpense: (id: string, payload: { date?: string; amount?: number; detail?: string; note?: string }) =>
    request('PUT', `/api/expenses/${id}`, payload),
  deleteExpense: (id: string) =>
    request('DELETE', `/api/expenses/${id}`),
  fixData: () =>
    request('POST', '/api/admin/fix-data'),
}

// ─── Budget ──────────────────────────────────────────────────────
export const budgetApi = {
  getBudget: (monthYear?: string) =>
    request('GET', '/api/budget', undefined, monthYear ? { monthYear } : {}),
  getYearly: (year?: number) =>
    request('GET', '/api/budget/yearly', undefined, year ? { year: String(year) } : {}),
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
  getUsers: (params?: { search?: string; page?: number; perPage?: number }) => {
    const p: Record<string, string> = {}
    if (params?.search) p.search = params.search
    if (params?.page) p.page = String(params.page)
    if (params?.perPage) p.perPage = String(params.perPage)
    return request('GET', '/api/users', undefined, p)
  },
  updateUser: (username: string, payload: unknown) =>
    request('PUT', `/api/users/${username}`, payload),
  deleteUser: (username: string) =>
    request('DELETE', `/api/users/${username}`),
}

// ─── Chat ────────────────────────────────────────────────────────
export const chatApi = {
  getContacts: () => request('GET', '/api/chat/contacts'),
  getConversations: () => request('GET', '/api/chat/conversations'),
  getMessages: (otherUsername: string, params?: { limit?: number; before?: string }) => {
    const p: Record<string, string> = {}
    if (params?.limit) p.limit = String(params.limit)
    if (params?.before) p.before = params.before
    return request('GET', `/api/chat/messages/${otherUsername}`, undefined, p)
  },
  sendMessage: (otherUsername: string, content: string) =>
    request('POST', `/api/chat/messages/${otherUsername}`, { content }),
}

// ─── Inventory ───────────────────────────────────────────────────
export const warehouseApi = {
  getWarehouses: () =>
    request('GET', '/api/inventory/warehouses'),
  createWarehouse: (payload: unknown) =>
    request('POST', '/api/inventory/warehouses', payload),
  updateWarehouse: (id: string, payload: unknown) =>
    request('PUT', `/api/inventory/warehouses/${id}`, payload),
  deleteWarehouse: (id: string) =>
    request('DELETE', `/api/inventory/warehouses/${id}`),
  verifyPin: (warehouseId: string, pin: string) =>
    request('POST', '/api/inventory/warehouses/verify', { warehouseId, pin }),
  changePin: (warehouseId: string, oldPin: string, newPin: string) =>
    request('POST', '/api/inventory/warehouses/change-pin', { warehouseId, oldPin, newPin }),
}

export const inventoryApi = {
  getSummary: (warehouseId: string) =>
    request('GET', '/api/inventory/summary', undefined, { warehouseId }),
  getItems: (warehouseId: string) =>
    request('GET', '/api/inventory/items', undefined, { warehouseId }),
  createItem: (payload: unknown) =>
    request('POST', '/api/inventory/items', payload),
  updateItem: (id: string, payload: unknown) =>
    request('PUT', `/api/inventory/items/${id}`, payload),
  deleteItem: (id: string) =>
    request('DELETE', `/api/inventory/items/${id}`),
  getTransactions: (warehouseId: string, itemId?: string) =>
    request('GET', '/api/inventory/transactions', undefined,
      itemId ? { warehouseId, itemId } : { warehouseId }),
  createTransaction: (payload: unknown) =>
    request('POST', '/api/inventory/transactions', payload),
  editTransaction: (id: string, payload: unknown) =>
    request('PUT', `/api/inventory/transactions/${id}`, payload),
  deleteTransaction: (id: string) =>
    request('DELETE', `/api/inventory/transactions/${id}`),
}

// ─── Profile ─────────────────────────────────────────────────────
export const profileApi = {
  getMe: () => request('GET', '/api/profile/me'),
  updateMe: (payload: {
    firstName?: string; lastName?: string; nickname?: string
    phone?: string; lineId?: string; jobTitle?: string
  }) => request('PUT', '/api/profile/me', payload),
  updatePhoto: (photo: string) => request('PUT', '/api/profile/photo', { photo }),
  deletePhoto: () => request('DELETE', '/api/profile/photo'),
  updateSignature: (signature: string) => request('PUT', '/api/profile/signature', { signature }),
  deleteSignature: () => request('DELETE', '/api/profile/signature'),
  requestPermission: (permissions: Record<string, boolean>, reason?: string) =>
    request('POST', '/api/profile/request-permission', { permissions, reason: reason ?? '' }),
}

// ─── Notifications ────────────────────────────────────────────────
export const notificationApi = {
  getAll: () => request('GET', '/api/notifications'),
  markRead: (id: string) => request('PUT', `/api/notifications/${id}/read`),
  markAllRead: () => request('PUT', '/api/notifications/read-all'),
  delete: (id: string) => request('DELETE', `/api/notifications/${id}`),
  sendLineNotify: (message: string, token: string) =>
    request('POST', '/api/notifications/line-notify', { message, token }),
}

// ─── Expense Drafts ──────────────────────────────────────────────
export const expenseDraftApi = {
  submit: (payload: unknown) =>
    request('POST', '/api/expenses/draft', payload),
  getDrafts: (status?: string) =>
    request('GET', '/api/expenses/drafts', undefined, status ? { status } : {}),
  approve: (id: string) =>
    request('PUT', `/api/expenses/drafts/${id}/approve`),
  reject: (id: string, reason: string) =>
    request('PUT', `/api/expenses/drafts/${id}/reject`, { reason }),
  getHistory: (params?: { monthYear?: string; catKey?: string; search?: string; page?: number; perPage?: number }) => {
    const p: Record<string, string> = {}
    if (params?.monthYear) p.monthYear = params.monthYear
    if (params?.catKey && params.catKey !== 'all') p.catKey = params.catKey
    if (params?.search) p.search = params.search
    if (params?.page) p.page = String(params.page)
    if (params?.perPage) p.perPage = String(params.perPage)
    return request('GET', '/api/expenses/history', undefined, p)
  },
}

// ─── Categories ──────────────────────────────────────────────────
export const categoryApi = {
  getAll: () => request('GET', '/api/categories'),
  getMine: () => request('GET', '/api/categories/mine'),
  getPublic: (username: string) => request('GET', '/api/categories/public', undefined, { username }),
  getSummary: (id: string) => request('GET', `/api/categories/${id}/summary`),
  searchUsers: (q: string) => request('GET', '/api/categories/users/search', undefined, { q }),
  create: (payload: unknown) => request('POST', '/api/categories', payload),
  update: (id: string, payload: unknown) => request('PUT', `/api/categories/${id}`, payload),
  delete: (id: string) => request('DELETE', `/api/categories/${id}`),
}

// ─── Dynamic Expense Drafts ───────────────────────────────────────
export const dynamicDraftApi = {
  submit: (payload: unknown) =>
    request('POST', '/api/expenses/draft/dynamic', payload),
  submitPublic: (payload: unknown) =>
    request('POST', '/api/expenses/draft/public', payload),
  approve: (id: string) =>
    request('PUT', `/api/expenses/drafts/${id}/approve/dynamic`),
  getAnalysis: (monthYear?: string) =>
    request('GET', '/api/analysis/dynamic', undefined, monthYear ? { monthYear } : {}),
}

// ─── Settings ────────────────────────────────────────────────────
export const settingsApi = {
  get: () => request('GET', '/api/settings'),
  update: (payload: {
    smtpEmail?: string; smtpPassword?: string; smtpServer?: string; smtpPort?: number
    lineOaConfigs?: Array<{
      id: string; category: string; name: string
      token: string; channelId: string; channelSecret: string
      mode: 'receive' | 'send' | 'both'; targetId?: string
    }>
    budgetReminderEnabled?: boolean
    budgetReminderMessageDay30?: string
    budgetReminderMessageDay4?: string
  }) => request('PUT', '/api/settings', payload),
}

// ─── Sales Pipeline & CRM Activities ─────────────────────────────
export const salesApi = {
  getDeals: (params?: Record<string, any>) => request('GET', '/api/deals', undefined, params),
  createDeal: (payload: any) => request('POST', '/api/deals', payload),
  updateDeal: (id: string, payload: any) => request('PUT', `/api/deals/${id}`, payload),
  deleteDeal: (id: string) => request('DELETE', `/api/deals/${id}`),
}

export const activityApi = {
  getActivities: (params?: Record<string, any>) => request('GET', '/api/activities', undefined, params),
  createActivity: (payload: any) => request('POST', '/api/activities', payload),
  updateActivity: (id: string, payload: any) => request('PUT', `/api/activities/${id}`, payload),
  deleteActivity: (id: string) => request('DELETE', `/api/activities/${id}`),
}

// ─── Reports ─────────────────────────────────────────────────────
export const reportApi = {
  generate: (payload: {
    catId: string; periodType: 'daily' | 'weekly' | 'monthly'
    sendLine?: boolean; lineOaConfigId?: string; targetId?: string
  }) => request('POST', '/api/reports/generate', payload),
  download: (reportId: string) =>
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/api/reports/download/${reportId}`,
}

// ─── Customer Segments ────────────────────────────────────────────
export const segmentApi = {
  getAll: (wsId: string) =>
    request('GET', `/api/crm-workspaces/${wsId}/segments`),
  create: (wsId: string, payload: unknown) =>
    request('POST', `/api/crm-workspaces/${wsId}/segments`, payload),
  update: (wsId: string, id: string, payload: unknown) =>
    request('PUT', `/api/crm-workspaces/${wsId}/segments/${id}`, payload),
  delete: (wsId: string, id: string) =>
    request('DELETE', `/api/crm-workspaces/${wsId}/segments/${id}`),
}

// ─── CRM Workspaces ───────────────────────────────────────────────
export const workspaceApi = {
  getAll: () => request('GET', '/api/crm-workspaces'),
  get: (id: string) => request('GET', `/api/crm-workspaces/${id}`),
  create: (payload: unknown) => request('POST', '/api/crm-workspaces', payload),
  update: (id: string, payload: unknown) => request('PUT', `/api/crm-workspaces/${id}`, payload),
  delete: (id: string) => request('DELETE', `/api/crm-workspaces/${id}`),
}

// ─── Customers (CRM — workspace-scoped) ──────────────────────────
export const customerApi = {
  getAll: (wsId: string, params?: { q?: string; type?: string; tag?: string; status?: string; segmentId?: string; page?: number; perPage?: number }) => {
    const p: Record<string, string> = {}
    if (params?.q) p.q = params.q
    if (params?.type) p.type = params.type
    if (params?.tag) p.tag = params.tag
    if (params?.status !== undefined) p.status = params.status
    if (params?.segmentId) p.segmentId = params.segmentId
    if (params?.page) p.page = String(params.page)
    if (params?.perPage) p.perPage = String(params.perPage)
    return request('GET', `/api/crm-workspaces/${wsId}/customers`, undefined, p)
  },
  get: (wsId: string, id: string) =>
    request('GET', `/api/crm-workspaces/${wsId}/customers/${id}`),
  create: (wsId: string, payload: unknown) =>
    request('POST', `/api/crm-workspaces/${wsId}/customers`, payload),
  update: (wsId: string, id: string, payload: unknown) =>
    request('PUT', `/api/crm-workspaces/${wsId}/customers/${id}`, payload),
  delete: (wsId: string, id: string) =>
    request('DELETE', `/api/crm-workspaces/${wsId}/customers/${id}`),
  getTags: (wsId: string) =>
    request('GET', `/api/crm-workspaces/${wsId}/customers/tags`),
  addTag: (wsId: string, id: string, tag: string) =>
    request('POST', `/api/crm-workspaces/${wsId}/customers/${id}/tags`, { tag }),
  removeTag: (wsId: string, id: string, tag: string) =>
    request('DELETE', `/api/crm-workspaces/${wsId}/customers/${id}/tags/${tag}`),
  exportCsvUrl: (wsId: string, params?: { type?: string; tag?: string; status?: string }) => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
    const p = new URLSearchParams()
    if (params?.type) p.set('type', params.type)
    if (params?.tag) p.set('tag', params.tag)
    if (params?.status) p.set('status', params.status)
    const token = typeof window !== 'undefined' ? (() => {
      try { const u = JSON.parse(sessionStorage.getItem('planeat_user') || '{}'); return u.token || '' } catch { return '' }
    })() : ''
    if (token) p.set('token', token)
    return `${BASE_URL}/api/crm-workspaces/${wsId}/customers/export/csv?${p.toString()}`
  },
}

// ─── Health ──────────────────────────────────────────────────────
export const healthApi = {
  ping: () => request('GET', '/api/health'),
}
