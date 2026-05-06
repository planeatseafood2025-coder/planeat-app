import type { Role, UserStatus, SystemSettings } from '@/types'

export const ALL_ROLES: Role[] = [
  'super_admin', 'it_manager', 'it_support',
  'accounting_manager', 'accountant',
  'hr_manager', 'hr',
  'warehouse_manager', 'warehouse_staff',
  'production_manager', 'production_staff',
  'marketing_manager', 'marketing_staff',
  'engineering_manager', 'engineering_staff',
  'general_user',
]

export const STATUS_LABELS: Record<UserStatus, string> = {
  active:    'ใช้งาน',
  pending:   'รอการอนุมัติ',
  suspended: 'ระงับ',
}

export const STATUS_COLORS: Record<UserStatus, { bg: string; color: string }> = {
  active:    { bg: '#d1fae5', color: '#065f46' },
  pending:   { bg: '#fef9c3', color: '#a16207' },
  suspended: { bg: '#fee2e2', color: '#dc2626' },
}

export const PER_PAGE = 20

export const DEFAULT_SETTINGS: SystemSettings = {
  mainLineOa: null,
  lineOaConfigs: [],
  moduleConnections: { expense: '', expenseName: '', inventory: '', inventoryName: '', crm: '', crmName: '', access: '', accessName: '' },
  smtpEmail: '',
  smtpPassword: '',
  smtpServer: 'smtp.gmail.com',
  smtpPort: 587,
  budgetReminderEnabled: true,
  budgetReminderMessageDay30: '📋 เดือนหน้าใกล้มาแล้ว กรุณาระบุงบประมาณประจำเดือน [เดือน] ในระบบ PlaNeat',
  budgetReminderMessageDay4: '⚠️ ยังไม่พบการระบุงบประมาณเดือน [เดือน] กรุณาดำเนินการในระบบ PlaNeat',
}

export const MODULE_LABELS: { key: 'expense'|'inventory'|'crm'|'access'; nameKey: 'expenseName'|'inventoryName'|'crmName'|'accessName'; label: string; icon: string }[] = [
  { key: 'expense',   nameKey: 'expenseName',   label: 'ระบบควบคุมค่าใช้จ่าย', icon: 'receipt_long' },
  { key: 'inventory', nameKey: 'inventoryName', label: 'ระบบจัดการคลัง',        icon: 'inventory_2' },
  { key: 'crm',       nameKey: 'crmName',       label: 'ระบบลูกค้า (CRM)',       icon: 'people' },
  { key: 'access',    nameKey: 'accessName',    label: 'ระบบ Access Control',    icon: 'admin_panel_settings' },
]
