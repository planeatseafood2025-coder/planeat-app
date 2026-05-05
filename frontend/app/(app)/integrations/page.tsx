'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSession } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

interface MainLineOA { token: string; channelId: string; channelSecret: string; targetId: string; basicId: string }
interface LineLoginConfig { clientId: string; clientSecret: string; callbackUrl: string }
interface LineOAConfig { id: string; name: string; token: string; channelId: string; channelSecret: string; mode: string; targetId: string }
interface Settings {
  mainLineOa: MainLineOA | null
  lineLogin: LineLoginConfig | null
  lineOaConfigs: LineOAConfig[]
  smtpEmail: string; smtpPassword: string; smtpServer: string; smtpPort: number
  moduleConnections: {
    expense: string; expenseName: string; expenseOaId: string
    inventory: string; inventoryName: string; inventoryOaId: string
    crm: string; crmName: string; crmOaId: string
    access: string; accessName: string; accessOaId: string
  }
  budgetReminderEnabled: boolean
  budgetReminderMessageDay30: string
  budgetReminderMessageDay4: string
}

// ── เมนูด้านซ้าย ────────────────────────────────────────────────
const MENUS = [
  { id: 'line-oa',      icon: 'smart_toy',        label: 'LINE OA หลัก' },
  { id: 'line-oa-list', icon: 'add_circle',        label: 'จัดการ LINE OA' },
  { id: 'line-login',   icon: 'login',             label: 'LINE Login' },
  { id: 'smtp',         icon: 'email',             label: 'อีเมล (SMTP)' },
  { id: 'modules',      icon: 'tune',              label: 'ตั้งค่าระบบควบคุมโมดูล' },
  { id: 'notifications',icon: 'notifications',     label: 'การแจ้งเตือน' },
]

const HELP_TEXT: Record<string, string> = {
  'line-oa': `LINE OA ใช้สำหรับ:\n• ส่งแจ้งเตือนผ่าน LINE กลุ่ม\n• รับ OTP ยืนยันตัวตนสมาชิก\n• Auto-import ลูกค้าเมื่อ Follow\n\nหาค่าที่: developers.line.biz\n→ Channel → Basic settings`,
  'line-oa-list': `สร้าง LINE OA เพิ่มเติมได้ไม่จำกัด\nแต่ละ OA มีโควต้าข้อความแยกกัน\n\nนำ Webhook URL ไปใส่ใน\nLINE Developer Console → Messaging API`,
  'line-login': `LINE Login ใช้สำหรับ:\n• ปุ่ม "Login ด้วย LINE"\n• ดึง Profile อัตโนมัติ\n\nหาค่าที่: developers.line.biz\n→ สร้าง Channel ประเภท LINE Login`,
  'smtp': `SMTP ใช้ส่งอีเมลแจ้งเตือน\n\nแนะนำ Gmail:\n• เปิด 2FA → สร้าง App Password\nที่ myaccount.google.com`,
  'modules': `กำหนด LINE Group ID + เลือก LINE OA สำหรับแต่ละโมดูล\nถ้าไม่เลือก OA จะใช้ OA หลักอัตโนมัติ`,
  'notifications': `ตั้งค่าข้อความแจ้งเตือนงบประมาณ\nที่จะส่งอัตโนมัติทุกเดือน`,
}

// ── Components ───────────────────────────────────────────────────
function HelpPopover({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center">?</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-6 top-0 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs text-gray-700 whitespace-pre-line">
            {text}
            <button onClick={() => setOpen(false)} className="mt-2 text-blue-500 hover:underline block">ปิด</button>
          </div>
        </>
      )}
    </div>
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
}

function MaskedInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off" className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
      <button type="button" onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        <span className="material-icons text-sm">{show ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        {help && <HelpPopover text={help} />}
      </div>
      {children}
    </div>
  )
}

function SaveBtn({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <div className="flex justify-end pt-4 border-t border-gray-100">
      <button onClick={onClick} disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2">
        {saving && <span className="material-icons text-base animate-spin">sync</span>}
        บันทึก
      </button>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const [activeMenu, setActiveMenu] = useState('line-oa')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const copyWebhook = () => {
    if (!webhookUrl) return
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const [settings, setSettings] = useState<Settings>({
    mainLineOa: null, lineLogin: null, lineOaConfigs: [],
    smtpEmail: '', smtpPassword: '', smtpServer: 'smtp.gmail.com', smtpPort: 587,
    moduleConnections: { expense: '', expenseName: '', expenseOaId: '', inventory: '', inventoryName: '', inventoryOaId: '', crm: '', crmName: '', crmOaId: '', access: '', accessName: '', accessOaId: '' },
    budgetReminderEnabled: true,
    budgetReminderMessageDay30: '📋 เดือนหน้าใกล้มาแล้ว กรุณาระบุงบประมาณประจำเดือน [เดือน]',
    budgetReminderMessageDay4: '⚠️ ยังไม่พบการระบุงบประมาณเดือน [เดือน] กรุณาดำเนินการ',
  })

  // form states
  const [lineOa, setLineOa]         = useState({ token: '', channelId: '', channelSecret: '', targetId: '', basicId: '' })
  const [lineOaConfigs, setLineOaConfigs] = useState<LineOAConfig[]>([])
  const [lineLogin, setLineLogin]   = useState({ clientId: '', clientSecret: '', callbackUrl: '' })
  const [smtp, setSmtp]             = useState({ email: '', password: '', server: 'smtp.gmail.com', port: 587 })
  const [modules, setModules]       = useState({ expense: '', expenseName: '', expenseOaId: '', inventory: '', inventoryName: '', inventoryOaId: '', crm: '', crmName: '', crmOaId: '', access: '', accessName: '', accessOaId: '' })
  const [notif, setNotif]           = useState({ enabled: true, day30: '', day4: '' })

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    const session = getSession()
    if (!session) return
    const res = await fetch(`${API_BASE}/api/settings`, { headers: { Authorization: `Bearer ${session.token}` } })
    if (!res.ok) return
    const { settings: s } = await res.json()

    // ดึง Webhook URL จริงจาก backend
    try {
      const wRes = await fetch(`${API_BASE}/api/line/webhook-info/main`, { headers: { Authorization: `Bearer ${session.token}` } })
      if (wRes.ok) {
        const wData = await wRes.json()
        setWebhookUrl(wData.webhookUrl || '')
      }
    } catch {}

    setSettings(s)
    if (s.mainLineOa) setLineOa({ token: s.mainLineOa.token || '', channelId: s.mainLineOa.channelId || '', channelSecret: s.mainLineOa.channelSecret || '', targetId: s.mainLineOa.targetId || '', basicId: s.mainLineOa.basicId || '' })
    if (s.lineLogin)  setLineLogin({ clientId: s.lineLogin.clientId || '', clientSecret: s.lineLogin.clientSecret || '', callbackUrl: s.lineLogin.callbackUrl || '' })
    setLineOaConfigs(s.lineOaConfigs || [])
    setSmtp({ email: s.smtpEmail || '', password: s.smtpPassword || '', server: s.smtpServer || 'smtp.gmail.com', port: s.smtpPort || 587 })
    if (s.moduleConnections) setModules({ ...{ expense: '', expenseName: '', expenseOaId: '', inventory: '', inventoryName: '', inventoryOaId: '', crm: '', crmName: '', crmOaId: '', access: '', accessName: '', accessOaId: '' }, ...s.moduleConnections })
    setNotif({ enabled: s.budgetReminderEnabled ?? true, day30: s.budgetReminderMessageDay30 || '', day4: s.budgetReminderMessageDay4 || '' })
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (patch: object) => {
    setSaving(true)
    try {
      const session = getSession()
      const cur = await fetch(`${API_BASE}/api/settings`, { headers: { Authorization: `Bearer ${session!.token}` } }).then(r => r.json())
      const merged = { ...(cur.settings || {}), ...patch }
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.token}` },
        body: JSON.stringify(merged),
      })
      if (res.ok) { showToast('บันทึกสำเร็จ ✓'); await load() }
      else showToast('เกิดข้อผิดพลาด', 'error')
    } catch { showToast('เกิดข้อผิดพลาด', 'error') }
    finally { setSaving(false) }
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"

  return (
    <div className="flex h-full min-h-screen bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Sidebar เมนู ── */}
      <div className="w-60 flex-shrink-0 bg-white border-r border-gray-200 py-6">
        <div className="px-5 mb-5">
          <h2 className="font-bold text-gray-800 text-base">การเชื่อมต่อระบบ</h2>
          <p className="text-xs text-gray-400 mt-0.5">เฉพาะ Admin เท่านั้น</p>
        </div>

        <nav className="space-y-0.5 px-3">
          {MENUS.map(m => {
            const connected =
              m.id === 'line-oa'    ? !!(settings.mainLineOa?.token) :
              m.id === 'line-login' ? !!(settings.lineLogin?.clientId) :
              m.id === 'smtp'       ? !!(settings.smtpEmail) : true

            return (
              <button key={m.id} onClick={() => setActiveMenu(m.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                  activeMenu === m.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <span className={`material-icons text-lg ${activeMenu === m.id ? 'text-blue-600' : 'text-gray-400'}`}>{m.icon}</span>
                <span className="flex-1">{m.label}</span>
                <StatusDot connected={connected} />
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 py-8 px-8 max-w-2xl">

        {/* LINE OA หลัก */}
        {activeMenu === 'line-oa' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-800">LINE OA หลัก</h3>
              <HelpPopover text={HELP_TEXT['line-oa']} />
            </div>
            <Field label="Channel Access Token">
              <MaskedInput value={lineOa.token} onChange={v => setLineOa(p => ({ ...p, token: v }))} placeholder="Channel Access Token" />
            </Field>
            <Field label="Channel Secret">
              <MaskedInput value={lineOa.channelSecret} onChange={v => setLineOa(p => ({ ...p, channelSecret: v }))} placeholder="Channel Secret" />
            </Field>
            <Field label="Channel ID">
              <input value={lineOa.channelId} onChange={e => setLineOa(p => ({ ...p, channelId: e.target.value }))} placeholder="Channel ID" autoComplete="off" className={inputCls} />
            </Field>
            <Field label="Basic ID (สำหรับลิงก์ Add Friend)" help="Basic ID ของ LINE OA เช่น @abc1234\nดูได้ที่ LINE Developers Console → Basic settings">
              <input value={lineOa.basicId} onChange={e => setLineOa(p => ({ ...p, basicId: e.target.value }))} placeholder="@abc1234" autoComplete="off" className={inputCls} />
              {lineOa.basicId && (
                <a href={`https://line.me/R/ti/p/${lineOa.basicId}`} target="_blank" rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-green-600 hover:underline">
                  <span className="material-icons text-sm">open_in_new</span>
                  ทดสอบลิงก์ Add Friend
                </a>
              )}
            </Field>
            <Field label="Target ID (Group ID สำหรับ push message)" help="ID ของกลุ่ม LINE ที่จะส่งแจ้งเตือน\nได้มาอัตโนมัติเมื่อ bot เข้ากลุ่ม">
              <input value={lineOa.targetId} onChange={e => setLineOa(p => ({ ...p, targetId: e.target.value }))} placeholder="C1234..." autoComplete="off" className={inputCls} />
            </Field>
            <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <span className="material-icons text-sm">link</span>
                Webhook URL (นำไปใส่ใน LINE Developer Console)
              </div>
              {webhookUrl ? (
                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-200">
                  <code className="flex-1 break-all text-blue-800 select-all">{webhookUrl}</code>
                  <button onClick={copyWebhook}
                    className="flex-shrink-0 text-blue-600 hover:text-blue-800 transition-colors"
                    title="คัดลอก">
                    <span className="material-icons text-base">{copied ? 'check' : 'content_copy'}</span>
                  </button>
                </div>
              ) : (
                <div className="text-blue-400 italic">กำลังโหลด URL...</div>
              )}
              <p className="text-blue-500">URL นี้อัปเดตอัตโนมัติตามสภาพแวดล้อม (Local/ngrok/VPS)</p>
            </div>
            <SaveBtn onClick={() => save({ mainLineOa: lineOa })} saving={saving} />
          </div>
        )}

        {/* จัดการ LINE OA หลายตัว */}
        {activeMenu === 'line-oa-list' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-800">จัดการ LINE OA</h3>
                <HelpPopover text={HELP_TEXT['line-oa-list']} />
              </div>
              <button
                onClick={() => {
                  const newId = `oa_${Date.now()}`
                  setLineOaConfigs(p => [...p, { id: newId, name: '', token: '', channelId: '', channelSecret: '', mode: 'both', targetId: '' }])
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium">
                <span className="material-icons text-base">add</span>
                เพิ่ม LINE OA
              </button>
            </div>

            {lineOaConfigs.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                <span className="material-icons text-4xl mb-2 block text-gray-300">smart_toy</span>
                ยังไม่มี LINE OA เพิ่มเติม<br />กดปุ่ม "เพิ่ม LINE OA" เพื่อสร้างใหม่
              </div>
            )}

            {lineOaConfigs.map((oa, idx) => {
              return (
                <div key={oa.id} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">OA #{idx + 1}</span>
                    <button onClick={() => setLineOaConfigs(p => p.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 transition-colors">
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </div>

                  <Field label="ชื่อ LINE OA">
                    <input value={oa.name} onChange={e => setLineOaConfigs(p => p.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                      placeholder="เช่น OA ค่าใช้จ่าย, OA HR" autoComplete="off" className={inputCls} />
                  </Field>
                  <Field label="Channel Access Token">
                    <MaskedInput value={oa.token} onChange={v => setLineOaConfigs(p => p.map((c, i) => i === idx ? { ...c, token: v } : c))}
                      placeholder="Channel Access Token" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Channel Secret">
                      <MaskedInput value={oa.channelSecret} onChange={v => setLineOaConfigs(p => p.map((c, i) => i === idx ? { ...c, channelSecret: v } : c))}
                        placeholder="Channel Secret" />
                    </Field>
                    <Field label="Channel ID">
                      <input value={oa.channelId} onChange={e => setLineOaConfigs(p => p.map((c, i) => i === idx ? { ...c, channelId: e.target.value } : c))}
                        placeholder="Channel ID" autoComplete="off" className={inputCls} />
                    </Field>
                  </div>
                  <Field label="Mode">
                    <select value={oa.mode} onChange={e => setLineOaConfigs(p => p.map((c, i) => i === idx ? { ...c, mode: e.target.value } : c))}
                      className={inputCls}>
                      <option value="both">รับและส่ง (both)</option>
                      <option value="send">ส่งอย่างเดียว (send)</option>
                      <option value="receive">รับอย่างเดียว (receive)</option>
                    </select>
                  </Field>

                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1.5">
                    <div className="font-semibold flex items-center gap-1">
                      <span className="material-icons text-sm">link</span>
                      Webhook URL — นำไปใส่ใน LINE Developer Console
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-blue-200">
                      <code className="flex-1 break-all text-blue-800 select-all text-xs">{`https://planeatsupport.duckdns.org/api/line/webhook/${oa.id}`}</code>
                      <button onClick={() => navigator.clipboard.writeText(`https://planeatsupport.duckdns.org/api/line/webhook/${oa.id}`)}
                        className="flex-shrink-0 text-blue-600 hover:text-blue-800">
                        <span className="material-icons text-sm">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {lineOaConfigs.length > 0 && (
              <SaveBtn onClick={() => save({ lineOaConfigs })} saving={saving} />
            )}
          </div>
        )}

        {/* LINE Login */}
        {activeMenu === 'line-login' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-800">LINE Login</h3>
              <HelpPopover text={HELP_TEXT['line-login']} />
            </div>
            <Field label="Channel ID (Client ID)">
              <input value={lineLogin.clientId} onChange={e => setLineLogin(p => ({ ...p, clientId: e.target.value }))} placeholder="Channel ID" autoComplete="off" className={inputCls} />
            </Field>
            <Field label="Channel Secret (Client Secret)">
              <MaskedInput value={lineLogin.clientSecret} onChange={v => setLineLogin(p => ({ ...p, clientSecret: v }))} placeholder="Channel Secret" />
            </Field>
            <Field label="Callback URL">
              <input value={lineLogin.callbackUrl} onChange={e => setLineLogin(p => ({ ...p, callbackUrl: e.target.value }))} placeholder="https://yourdomain.com/auth/line/callback" autoComplete="off" className={inputCls} />
            </Field>
            <div className="bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
              ⚠️ ต้องเพิ่ม Callback URL นี้ใน LINE Developer Console ด้วย
            </div>
            <SaveBtn onClick={() => save({ lineLogin })} saving={saving} />
          </div>
        )}

        {/* SMTP */}
        {activeMenu === 'smtp' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-800">อีเมล (SMTP)</h3>
              <HelpPopover text={HELP_TEXT['smtp']} />
            </div>
            <Field label="อีเมล">
              <input type="email" value={smtp.email} onChange={e => setSmtp(p => ({ ...p, email: e.target.value }))} placeholder="your@gmail.com" autoComplete="off" className={inputCls} />
            </Field>
            <Field label="App Password">
              <MaskedInput value={smtp.password} onChange={v => setSmtp(p => ({ ...p, password: v }))} placeholder="App Password จาก Google" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP Server">
                <input value={smtp.server} onChange={e => setSmtp(p => ({ ...p, server: e.target.value }))} autoComplete="off" className={inputCls} />
              </Field>
              <Field label="Port">
                <input type="number" value={smtp.port} onChange={e => setSmtp(p => ({ ...p, port: Number(e.target.value) }))} autoComplete="off" className={inputCls} />
              </Field>
            </div>
            <SaveBtn onClick={() => save({ smtpEmail: smtp.email, smtpPassword: smtp.password, smtpServer: smtp.server, smtpPort: smtp.port })} saving={saving} />
          </div>
        )}

        {/* ตั้งค่าระบบควบคุมโมดูล */}
        {activeMenu === 'modules' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-800">ตั้งค่าระบบควบคุมโมดูล</h3>
              <HelpPopover text={HELP_TEXT['modules']} />
            </div>
            <p className="text-xs text-gray-500">กำหนด LINE Group ID สำหรับส่งแจ้งเตือนแยกตามโมดูล</p>

            {[
              { key: 'expense',   nameKey: 'expenseName',   oaKey: 'expenseOaId',   label: 'ระบบค่าใช้จ่าย', icon: 'receipt_long' },
              { key: 'inventory', nameKey: 'inventoryName', oaKey: 'inventoryOaId', label: 'คลังสินค้า',      icon: 'inventory_2' },
              { key: 'crm',       nameKey: 'crmName',       oaKey: 'crmOaId',       label: 'CRM ลูกค้า',      icon: 'contacts' },
              { key: 'access',    nameKey: 'accessName',    oaKey: 'accessOaId',    label: 'Access Control',  icon: 'admin_panel_settings' },
            ].map(item => {
              const selectedOaId = (modules as any)[item.oaKey] || ''
              const isConnected = !!(modules as any)[item.key]
              return (
                <div key={item.key} className={`border rounded-xl p-4 space-y-3 ${isConnected ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-icons text-gray-400 text-base">{item.icon}</span>
                      <span className="text-sm font-medium text-gray-700">{item.label}</span>
                    </div>
                    {isConnected && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"/>เชื่อมต่อแล้ว</span>}
                  </div>
                  <Field label="LINE Group ID">
                    <input value={(modules as any)[item.key]} onChange={e => setModules(p => ({ ...p, [item.key]: e.target.value }))} placeholder="C1234..." autoComplete="off" className={inputCls} />
                  </Field>
                  <Field label="ชื่อกลุ่ม (optional)">
                    <input value={(modules as any)[item.nameKey]} onChange={e => setModules(p => ({ ...p, [item.nameKey]: e.target.value }))} placeholder="เช่น กลุ่มบัญชี" autoComplete="off" className={inputCls} />
                  </Field>
                  <Field label="LINE OA ที่ใช้ส่ง" help="เลือก OA ที่จะใช้ส่งข้อความสำหรับโมดูลนี้\nถ้าไม่เลือกจะใช้ OA หลักอัตโนมัติ">
                    <select value={selectedOaId} onChange={e => setModules(p => ({ ...p, [item.oaKey]: e.target.value }))} className={inputCls}>
                      <option value="">OA หลัก (default)</option>
                      {lineOaConfigs.map(oa => (
                        <option key={oa.id} value={oa.id}>{oa.name || oa.id}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )
            })}
            <SaveBtn onClick={() => save({ moduleConnections: modules })} saving={saving} />
          </div>
        )}

        {/* การแจ้งเตือน */}
        {activeMenu === 'notifications' && (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-gray-800">การแจ้งเตือน</h3>
            <p className="text-xs text-gray-500">ข้อความแจ้งเตือนงบประมาณที่ส่งอัตโนมัติทุกเดือน ใช้ <code>[เดือน]</code> แทนชื่อเดือน</p>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <span className="text-sm font-medium text-gray-700">เปิดใช้งานการแจ้งเตือน</span>
              <button onClick={() => setNotif(p => ({ ...p, enabled: !p.enabled }))}
                className={`w-11 h-6 rounded-full transition-colors ${notif.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${notif.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <Field label="ข้อความแจ้งเตือนล่วงหน้า 30 วัน">
              <textarea value={notif.day30} onChange={e => setNotif(p => ({ ...p, day30: e.target.value }))} rows={3} autoComplete="off" className={inputCls} />
            </Field>
            <Field label="ข้อความแจ้งเตือนล่วงหน้า 4 วัน">
              <textarea value={notif.day4} onChange={e => setNotif(p => ({ ...p, day4: e.target.value }))} rows={3} autoComplete="off" className={inputCls} />
            </Field>
            <SaveBtn onClick={() => save({ budgetReminderEnabled: notif.enabled, budgetReminderMessageDay30: notif.day30, budgetReminderMessageDay4: notif.day4 })} saving={saving} />
          </div>
        )}

      </div>
    </div>
  )
}
