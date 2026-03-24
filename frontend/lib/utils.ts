import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format number as Thai locale with ฿ */
export function fmt(n: number | string): string {
  return Number(n).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) + ' ฿'
}

/** Format number without ฿ */
export function fmtNum(n: number | string): string {
  return Number(n).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

/** ISO date (YYYY-MM-DD) to Thai format (dd/MM/yyyy) */
export function isoToThai(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/** YYYY-MM to MM/YYYY */
export function monthInputToApi(val: string): string {
  const parts = val.split('-')
  return `${parts[1]}/${parts[0]}`
}

/** MM/YYYY to YYYY-MM */
export function apiMonthToInput(val: string): string {
  const parts = val.split('/')
  return `${parts[1]}-${parts[0]}`
}

/** Today as ISO string (YYYY-MM-DD) */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Today as YYYY-MM */
export function todayMonth(): string {
  return todayIso().slice(0, 7)
}

/** Thai long date string */
export function thaiLongDate(date?: Date): string {
  const d = date ?? new Date()
  return d.toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Days in a month (month = 1-12) */
export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

/** Auto calculate daily rate from monthly budget */
export function autoDailyRate(monthly: number, monthYear: string): number {
  const [mm, yyyy] = monthYear.split('/')
  const days = getDaysInMonth(parseInt(mm), parseInt(yyyy))
  return days > 0 ? Math.round((monthly / days) * 100) / 100 : 0
}
