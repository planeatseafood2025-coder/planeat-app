// ─── User & Auth ─────────────────────────────────────────────────
export type Role =
  | 'super_admin'
  | 'it_manager' | 'it_support'
  | 'accounting_manager' | 'accountant'
  | 'hr_manager' | 'hr'
  | 'warehouse_manager' | 'warehouse_staff'
  | 'production_manager' | 'production_staff'
  | 'marketing_manager' | 'marketing_staff'
  | 'engineering_manager' | 'engineering_staff'
  | 'general_user'
  // legacy
  | 'admin' | 'recorder' | 'viewer'

export type UserStatus = 'active' | 'pending' | 'suspended'

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
  firstName?: string
  lastName?: string
  nickname?: string
  phone?: string
  lineId?: string
  jobTitle?: string
  status?: UserStatus
  token?: string
  profilePhoto?: string
  signature?: string
}

// ─── Notifications ────────────────────────────────────────────────
export interface Notification {
  id: string
  recipientUsername: string
  senderUsername: string
  type: 'permission_request' | 'status_change' | 'general'
  title: string
  body: string
  read: boolean
  createdAt: string
  data?: Record<string, unknown>
}

export interface NotificationsResponse {
  success: boolean
  notifications: Notification[]
  unread: number
}

// ─── Settings / IT Connections ────────────────────────────────────
export interface MainLineOA {
  token: string
  channelId: string
  channelSecret: string
  targetId: string
}

export interface LineOASetting {
  id: string
  category: string
  name: string
  token: string
  channelId: string
  channelSecret: string
  mode: 'receive' | 'send' | 'both'
  targetId: string
}

export interface ModuleConnections {
  expense:        string   // LINE Group ID สำหรับค่าใช้จ่าย
  expenseName:    string   // ชื่อกลุ่ม
  inventory:      string   // LINE Group ID สำหรับคลัง
  inventoryName:  string
  crm:            string   // LINE Group ID สำหรับ CRM
  crmName:        string
  access:         string   // LINE Group ID สำหรับ Access Control
  accessName:     string
}

export interface SystemSettings {
  mainLineOa?: MainLineOA | null
  lineOaConfigs: LineOASetting[]
  moduleConnections?: ModuleConnections
  smtpEmail?: string
  smtpPassword?: string
  smtpServer?: string
  smtpPort?: number
  budgetReminderEnabled?: boolean
  budgetReminderMessageDay30?: string
  budgetReminderMessageDay4?: string
}

// ─── Chat ─────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  roomId: string
  sender: string
  content: string
  createdAt: string
}

export interface ChatContact {
  username: string
  name: string
  firstName?: string
  lastName?: string
  nickname?: string
  role: Role
  jobTitle?: string
  profilePhoto?: string
}

export interface ChatConversation {
  roomId: string
  otherUser: ChatContact | null
  lastMessage: ChatMessage
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
  firstName?: string
  lastName?: string
  nickname?: string
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
  total: number
  page: number
  perPage: number
}

export interface UserRecord {
  username: string
  name: string
  firstName?: string
  lastName?: string
  nickname?: string
  phone?: string
  email?: string
  lineId?: string
  jobTitle?: string
  role: Role
  status: UserStatus
  permissions: UserPermissions
  profilePhoto?: string
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

// Roles that can manage users
export const ADMIN_ROLES: Role[] = ['super_admin', 'it_manager', 'it_support', 'admin']

const ALL_ROLES: Role[] = [
  'super_admin', 'it_manager', 'it_support',
  'accounting_manager', 'accountant',
  'hr_manager', 'hr',
  'warehouse_manager', 'warehouse_staff',
  'production_manager', 'production_staff',
  'marketing_manager', 'marketing_staff',
  'engineering_manager', 'engineering_staff',
  'general_user',
  'admin', 'recorder', 'viewer',
]

export const PAGE_ACCESS: Record<string, Role[]> = {
  overview:            ALL_ROLES,
  expense:             ['super_admin','it_manager','accounting_manager','accountant','admin','recorder'],
  'expense-control':   ALL_ROLES,
  budget:              ['super_admin','it_manager','accounting_manager','accountant','admin'],
  employees:           ['super_admin','it_manager','hr_manager','hr','admin'],
  inventory:           ['super_admin','it_manager','warehouse_manager','warehouse_staff',
                         'production_manager','production_staff','accounting_manager','accountant','admin','recorder','viewer'],
  documents:           ['super_admin','it_manager','admin'],
  reports:             ['super_admin','it_manager','accounting_manager','admin'],
  'it-access':         ['super_admin','it_manager','it_support','admin'],
  chat:                ALL_ROLES,
  customers:           ['super_admin','it_manager','accounting_manager','marketing_manager','marketing_staff','admin'],
}

// ─── CRM Workspace ───────────────────────────────────────────────
export interface CrmWorkspace {
  id: string
  name: string
  description?: string
  color: string
  icon: string
  lineOaConfigId?: string
  memberUsernames: string[]
  createdAt: string
  createdBy: string
}

export interface WorkspacesResponse {
  workspaces: CrmWorkspace[]
}

// ─── Customer (CRM) ──────────────────────────────────────────────
export interface ContactPerson {
  name: string
  position?: string
  phone?: string
  email?: string
  lineId?: string
}

export type CustomerSource = 'manual' | 'line_oa' | 'facebook' | 'instagram' | 'google_sheets' | 'tiktok' | 'shopee'

export interface CustomerSegment {
  id: string
  workspaceId: string
  name: string
  description?: string
  color: string
  icon: string
  customerCount?: number
  createdAt: string
  createdBy: string
}

export interface Customer {
  id: string
  workspaceId: string
  name: string
  type: 'B2B' | 'B2C'
  email?: string
  phone?: string
  lineUid?: string
  lineDisplayName?: string
  linePictureUrl?: string
  tags: string[]
  segmentIds: string[]
  company?: string
  address?: string
  note?: string
  contacts: ContactPerson[]
  source: CustomerSource
  sourceRef?: string
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface CustomersResponse {
  customers: Customer[]
  total: number
  page: number
  totalPages: number
}

// ─── Warehouse ───────────────────────────────────────────────────
export interface Warehouse {
  id: string
  name: string
  color: string
  bg: string
  icon: string
  desc: string
}

export interface WarehousesResponse {
  success: boolean
  warehouses: Warehouse[]
}

// ─── Inventory ───────────────────────────────────────────────────
export interface InventoryItem {
  warehouseId: string
  id: string
  code: string
  name: string
  category: string
  unit: string
  currentStock: number
  minStock: number
  unitCost: number
  location: string
  note: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type TxType = 'receive' | 'issue' | 'adjust'

export interface InventoryTransaction {
  id: string
  itemId: string
  itemCode: string
  itemName: string
  type: TxType
  quantity: number
  quantityBefore: number
  quantityAfter: number
  unitCost: number
  reference: string
  note: string
  recorder: string
  createdAt: string
}

export interface InventorySummary {
  totalItems: number
  totalValue: number
  lowStockCount: number
  outOfStockCount: number
  todayMovements: number
  byCategory: Record<string, { count: number; value: number }>
  lowStockItems: InventoryItem[]
  topValueItems: InventoryItem[]
}

export interface InventoryItemsResponse {
  success: boolean
  items: InventoryItem[]
}

export interface InventoryTransactionsResponse {
  success: boolean
  transactions: InventoryTransaction[]
}

export interface InventorySummaryResponse {
  success: boolean
  summary: InventorySummary
}

export const PAGE_TITLES: Record<string, string> = {
  overview:          'ภาพรวม',
  expense:           'บันทึกค่าใช้จ่าย',
  'expense-control': 'ระบบควบคุมค่าใช้จ่าย',
  budget:            'งบประมาณ',
  employees:  'ข้อมูลพนักงาน',
  inventory:  'คลังสินค้า',
  documents:  'เอกสาร',
  reports:    'รายงาน',
  'it-access':'Access Control',
  chat:       'แชท',
  customers:  'ลูกค้า (CRM)',
  settings:   'ตั้งค่าระบบ',
  profile:    'โปรไฟล์ของฉัน',
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin:          'สิทธิ์บริหารสูงสุด',
  it_manager:           'ผู้จัดการด้านไอที',
  it_support:           'ไอทีซัพพอร์ต',
  accounting_manager:   'ผู้จัดการฝ่ายบัญชี',
  accountant:           'ฝ่ายบัญชี',
  hr_manager:           'ผู้จัดการฝ่ายบุคคล',
  hr:                   'ฝ่ายบุคคล',
  warehouse_manager:    'ผู้จัดการคลังสินค้า',
  warehouse_staff:      'ฝ่ายจัดการคลังสินค้า',
  production_manager:   'ผู้จัดการฝ่ายผลิต',
  production_staff:     'ฝ่ายผลิต',
  marketing_manager:    'ผู้จัดการฝ่ายการตลาด',
  marketing_staff:      'ฝ่ายการตลาด',
  engineering_manager:  'ผู้จัดการฝ่ายวิศวกรรม',
  engineering_staff:    'ฝ่ายวิศวกรรม',
  general_user:         'ผู้ใช้ทั่วไป',
  admin:                'ผู้ดูแลระบบ (legacy)',
  recorder:             'ผู้บันทึกข้อมูล (legacy)',
  viewer:               'ผู้ตรวจสอบ (legacy)',
}

export const ROLE_COLORS: Record<Role, { bg: string; color: string }> = {
  super_admin:          { bg: '#fee2e2', color: '#dc2626' },
  it_manager:           { bg: '#fce7f3', color: '#be185d' },
  it_support:           { bg: '#fce7f3', color: '#db2777' },
  accounting_manager:   { bg: '#dbeafe', color: '#1d4ed8' },
  accountant:           { bg: '#eff6ff', color: '#2563eb' },
  hr_manager:           { bg: '#fef9c3', color: '#a16207' },
  hr:                   { bg: '#fefce8', color: '#ca8a04' },
  warehouse_manager:    { bg: '#d1fae5', color: '#047857' },
  warehouse_staff:      { bg: '#ecfdf5', color: '#059669' },
  production_manager:   { bg: '#ede9fe', color: '#6d28d9' },
  production_staff:     { bg: '#f5f3ff', color: '#7c3aed' },
  marketing_manager:    { bg: '#ffedd5', color: '#c2410c' },
  marketing_staff:      { bg: '#fff7ed', color: '#ea580c' },
  engineering_manager:  { bg: '#cffafe', color: '#0e7490' },
  engineering_staff:    { bg: '#ecfeff', color: '#0891b2' },
  general_user:         { bg: '#f1f5f9', color: '#64748b' },
  admin:                { bg: '#fee2e2', color: '#dc2626' },
  recorder:             { bg: '#d1fae5', color: '#059669' },
  viewer:               { bg: '#f1f5f9', color: '#64748b' },
}

// ─── Notification Schedule ───────────────────────────────────────
export interface ReportScheduleItem {
  enabled: boolean
  hour: number
  lineOaConfigId: string
  targetId: string
}

export interface NotificationSchedule {
  daily: ReportScheduleItem
  weekly: ReportScheduleItem
  weeklyDay: number    // 0=Mon, 4=Fri
  monthly: ReportScheduleItem
  monthlyDay: number   // 1-28
}

// ─── Dynamic Categories ──────────────────────────────────────────
export type CalcRole = 'qty' | 'price' | 'addend' | 'fixed' | 'note' | 'none'
export type FieldType = 'number' | 'text' | 'select'

export interface CategoryField {
  fieldId: string
  label: string
  type: FieldType
  unit: string
  placeholder: string
  required: boolean
  calcRole: CalcRole
  options: string[]
}

export interface ExpenseCategory {
  id: string
  name: string
  color: string
  icon: string
  formula: string
  fields: CategoryField[]
  allowedRoles: string[]
  allowedUsers: string[]
  order: number
  isActive: boolean
  createdAt: string
  createdBy: string
  notificationSchedule?: NotificationSchedule
}

export interface CategoriesResponse {
  success: boolean
  categories: ExpenseCategory[]
}

export interface CategorySummary {
  catId: string
  drafts: number
  records: number
  budgets: number
}

// Dynamic analysis response
export interface DynamicAnalysisEntry {
  catKey: string
  total: number
  label: string
  color: string
  icon: string
  budget: number
}

export interface DynamicAnalysisResponse {
  success: boolean
  monthYear: string
  categories: DynamicAnalysisEntry[]
  overallTotal: number
}

// ─── Expense Draft / Approval ─────────────────────────────────────
export type DraftStatus = 'pending' | 'approved' | 'rejected'

export interface ExpenseDraft {
  id: string
  recorder: string
  recorderName: string
  recorderLineId: string
  date: string
  category: string
  catKey: CatKey
  rows: unknown[]
  total: number
  detail: string
  note: string
  status: DraftStatus
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  rejectReason?: string
  approvedExpenseIds?: string[]
}

export interface ExpenseRecord {
  id: string
  date: string
  category: string
  catKey: CatKey
  amount: number
  recorder: string
  recorderName: string
  recorderLineId: string
  detail: string
  note: string
  approvedBy?: string
  approverName?: string
  approverLineId?: string
  approvedAt?: string
  draftId?: string
  createdAt?: string
}

export interface DraftsResponse {
  success: boolean
  drafts: ExpenseDraft[]
  isManager: boolean
}

export interface ExpenseHistoryResponse {
  success: boolean
  expenses: ExpenseRecord[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

// ─── Sales Pipeline (Deals & Activities) ─────────────────────────
export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'

export interface Deal {
  id: string
  title: string
  customerId: string
  value: number
  stage: DealStage
  probability: number
  assignedTo?: string
  expectedCloseDate?: string
  source?: string
  note?: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'line'

export interface CustomerActivity {
  id: string
  targetId: string
  targetType: 'customer' | 'deal'
  type: ActivityType
  description: string
  performedBy: string
  datetime: string
  createdAt: string
  updatedAt?: string
}
