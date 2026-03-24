// ─── User & Auth ─────────────────────────────────────────────────
export type Role = 'admin' | 'accountant' | 'recorder' | 'viewer'
export type CatKey = 'labor' | 'raw' | 'chem' | 'repair'

export interface UserPermissions {
  labor: boolean
  raw: boolean
  chem: boolean
  repair: boolean
}

export interface User {
  username: string
  name: string
  role: Role
  permissions: UserPermissions
  token?: string
}

// ─── Expense ─────────────────────────────────────────────────────
export interface Expense {
  id: string
  date: string          // dd/MM/yyyy
  category: string      // Thai name
  catKey: CatKey
  amount: number
  recorder: string
  note: string
  detail: string
}

// Rows submitted per category
export interface LaborRow {
  workers: number
  dailyWage: number
  ot: number
  note: string
}

export interface RawRow {
  itemName: string
  quantity: number
  pricePerKg: number
  note: string
}

export interface ChemRow {
  itemName: string
  quantity: number
  price: number
  note: string
}

export interface RepairRow {
  repairItem: string
  totalCost: number
  note: string
}

export interface SaveExpensePayload {
  username: string
  category: string
  date: string   // dd/MM/yyyy
  rows: LaborRow[] | RawRow[] | ChemRow[] | RepairRow[]
}

// ─── Budget ──────────────────────────────────────────────────────
export interface BudgetEntry {
  monthlyBudget: number
  dailyRate: number
  spentToday: number
  spentMonth: number
  remainDay: number
  remainMonth: number
  currentDay: number
}

export interface BudgetData {
  labor: BudgetEntry
  raw: BudgetEntry
  chem: BudgetEntry
  repair: BudgetEntry
}

export interface SetBudgetPayload {
  username: string
  monthYear: string   // MM/yyyy
  budgets: {
    labor: { monthly: number; daily: number }
    raw:   { monthly: number; daily: number }
    chem:  { monthly: number; daily: number }
    repair:{ monthly: number; daily: number }
  }
}

// ─── Analysis ────────────────────────────────────────────────────
export interface AnalysisEntry {
  total: number
  label: string
  color: string
  budget: number
}

export interface AnalysisData {
  labor: AnalysisEntry
  raw: AnalysisEntry
  chem: AnalysisEntry
  repair: AnalysisEntry
}

// ─── API Responses ───────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface LoginResponse {
  success: boolean
  message?: string
  username?: string
  name?: string
  role?: Role
  permissions?: UserPermissions
  token?: string
}

export interface ExpensesResponse {
  success: boolean
  expenses: Expense[]
  monthYear?: string
}

export interface BudgetResponse {
  success: boolean
  data: BudgetData
  monthYear: string
  currentDay: number
}

export interface AnalysisResponse {
  success: boolean
  monthYear: string
  analysis: AnalysisData
  overallTotal: number
}

export interface UsersResponse {
  success: boolean
  users: UserRecord[]
}

export interface UserRecord {
  username: string
  name: string
  role: Role
  labor: boolean
  raw: boolean
  chem: boolean
  repair: boolean
}

// ─── UI Helpers ──────────────────────────────────────────────────
export const CAT_NAMES: Record<CatKey, string> = {
  labor:  'ค่าแรงงาน',
  raw:    'ค่าวัตถุดิบ',
  chem:   'ค่าเคมี/หีบห่อ/ส่วนผสม',
  repair: 'ค่าซ่อมแซมและบำรุงรักษา',
}

export const CAT_STYLE: Record<CatKey, { bg: string; color: string; label: string; icon: string }> = {
  labor:  { bg: '#fef3c7', color: '#b45309', label: 'ค่าแรงงาน',        icon: 'engineering' },
  raw:    { bg: '#d1fae5', color: '#065f46', label: 'ค่าวัตถุดิบ',       icon: 'grass' },
  chem:   { bg: '#ede9fe', color: '#5b21b6', label: 'ค่าเคมี/หีบห่อ',   icon: 'science' },
  repair: { bg: '#ffe4e6', color: '#9f1239', label: 'ค่าซ่อมแซม',        icon: 'build' },
}

export const CHART_COLORS: Record<CatKey, string> = {
  labor:  '#f59e0b',
  raw:    '#10b981',
  chem:   '#8b5cf6',
  repair: '#f43f5e',
}

export const PAGE_ACCESS: Record<string, Role[]> = {
  overview:   ['admin', 'accountant', 'recorder', 'viewer'],
  expense:    ['admin', 'accountant', 'recorder'],
  budget:     ['admin', 'accountant'],
  employees:  ['admin'],
  inventory:  ['admin'],
  documents:  ['admin'],
  reports:    ['admin'],
  'it-access':['admin'],
}

export const PAGE_TITLES: Record<string, string> = {
  overview:   'ภาพรวม',
  expense:    'บันทึกค่าใช้จ่าย',
  budget:     'งบประมาณ',
  employees:  'ข้อมูลพนักงาน',
  inventory:  'คลังสินค้า',
  documents:  'เอกสาร',
  reports:    'รายงาน',
  'it-access':'Access Control',
  settings:   'ตั้งค่าระบบ',
}

export const ROLE_LABELS: Record<Role, string> = {
  admin:      'ผู้ดูแลระบบ IT',
  accountant: 'ผู้จัดการฝ่ายบัญชี',
  recorder:   'พนักงานกรอกข้อมูล',
  viewer:     'ผู้ตรวจสอบ',
}

export const ROLE_COLORS: Record<Role, { bg: string; color: string }> = {
  admin:      { bg: '#fee2e2', color: '#dc2626' },
  accountant: { bg: '#dbeafe', color: '#2563eb' },
  recorder:   { bg: '#d1fae5', color: '#059669' },
  viewer:     { bg: '#f1f5f9', color: '#64748b' },
}
