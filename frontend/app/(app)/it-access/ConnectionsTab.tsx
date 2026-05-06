'use client'
import { useState } from 'react'
import type { SystemSettings, LineOASetting } from '@/types'
import Modal from '@/components/ui/Modal'
import { MODULE_LABELS } from './_constants'

interface Props {
  settings: SystemSettings
  loading: boolean
  saving: boolean
  msg: string
  msgType: 'ok' | 'err'
  canManage: boolean
  onSettingsChange: (s: SystemSettings) => void
  onSave: () => void
}

export default function ConnectionsTab({ settings, loading, saving, msg, msgType, canManage, onSettingsChange, onSave }: Props) {
  const [showMainToken, setShowMainToken] = useState(false)
  const [showMainSecret, setShowMainSecret] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [editLineMode, setEditLineMode] = useState<false | 'add' | 'edit'>(false)
  const [editLineConfig, setEditLineConfig] = useState<LineOASetting | null>(null)
  const [showLineToken, setShowLineToken] = useState(false)
  const [showLineSecret, setShowLineSecret] = useState(false)

  function set(patch: Partial<SystemSettings>) { onSettingsChange({ ...settings, ...patch }) }

  function openAddLine() {
    setEditLineMode('add')
    setEditLineConfig({ id: crypto.randomUUID().split('-')[0], category: 'expense-control', name: '', token: '', channelId: '', channelSecret: '', mode: 'send', targetId: '' })
  }

  function openEditLine(c: LineOASetting) { setEditLineMode('edit'); setEditLineConfig({ ...c }) }

  function handleSaveLineConfig() {
    if (!editLineConfig) return
    if (!editLineConfig.name || !editLineConfig.token) { alert('กรุณากรอกชื่อ Note และ Token'); return }
    const configs = editLineMode === 'add'
      ? [...settings.lineOaConfigs, editLineConfig]
      : settings.lineOaConfigs.map(c => c.id === editLineConfig.id ? editLineConfig : c)
    set({ lineOaConfigs: configs })
    setEditLineMode(false)
  }

  function handleDeleteLineConfig(id: string) {
    if (!confirm('ยืนยันการลบ LINE Connection Note นี้? (คุณต้องกดบันทึกการตั้งค่าทั้งหมดถึงจะมีผลเปลี่ยนในระบบ)')) return
    set({ lineOaConfigs: settings.lineOaConfigs.filter(c => c.id !== id) })
  }

  if (loading) return (
    <div className="card flex items-center justify-center" style={{ padding: 48 }}>
      <span className="material-icons-round spin text-blue-400" style={{ fontSize: 28 }}>refresh</span>
    </div>
  )

  const mc = settings.moduleConnections ?? { expense: '', expenseName: '', inventory: '', inventoryName: '', crm: '', crmName: '', access: '', accessName: '' }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* 1. การเชื่อมต่อหลัก */}
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-1">
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-icons-round" style={{ fontSize: 22, color: '#16a34a' }}>hub</span>
          </div>
          <div>
            <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>การเชื่อมต่อหลัก</p>
            <p className="text-xs text-slate-400 mt-0.5">LINE OA หลักของระบบ — ใช้ตัวเดียวสำหรับทุกการแจ้งเตือนพื้นฐาน</p>
          </div>
          {settings.mainLineOa?.token ? (
            <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 600 }}>เชื่อมต่อแล้ว</span>
          ) : (
            <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8', fontSize: 12 }}>ยังไม่ได้ตั้งค่า</span>
          )}
        </div>

        <div className="flex gap-2 mb-4 mt-3 flex-wrap">
          {[{ icon: 'verified_user', label: 'รับ OTP บันทึกตัวตน (Access Control)' }, { icon: 'task_alt', label: 'แจ้งเตือนอนุมัติค่าใช้จ่ายใน LINE' }].map(b => (
            <div key={b.icon} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span className="material-icons-round" style={{ fontSize: 15, color: '#16a34a' }}>{b.icon}</span>
              <span style={{ fontSize: 12, color: '#166534' }}>{b.label}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Channel Access Token <span className="text-red-500">*</span></label>
            <div style={{ position: 'relative' }}>
              <input type={showMainToken ? 'text' : 'password'} className="form-input" placeholder="Bearer Token..."
                value={settings.mainLineOa?.token ?? ''}
                onChange={e => set({ mainLineOa: { ...(settings.mainLineOa ?? { channelId: '', channelSecret: '', targetId: '' }), token: e.target.value } })}
                style={{ paddingRight: 40 }} />
              <button type="button" onClick={() => setShowMainToken(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <span className="material-icons-round" style={{ fontSize: 18 }}>{showMainToken ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">Channel Secret</label>
            <div style={{ position: 'relative' }}>
              <input type={showMainSecret ? 'text' : 'password'} className="form-input" placeholder="Secret..."
                value={settings.mainLineOa?.channelSecret ?? ''}
                onChange={e => set({ mainLineOa: { ...(settings.mainLineOa ?? { token: '', channelId: '', targetId: '' }), channelSecret: e.target.value } })}
                style={{ paddingRight: 40 }} />
              <button type="button" onClick={() => setShowMainSecret(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <span className="material-icons-round" style={{ fontSize: 18 }}>{showMainSecret ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">Channel ID</label>
            <input className="form-input" placeholder="Channel ID..."
              value={settings.mainLineOa?.channelId ?? ''}
              onChange={e => set({ mainLineOa: { ...(settings.mainLineOa ?? { token: '', channelSecret: '', targetId: '' }), channelId: e.target.value } })} />
          </div>
          <div>
            <label className="form-label">Target ID (Group/User)</label>
            <input className="form-input" placeholder="Group ID หรือ User ID..."
              value={settings.mainLineOa?.targetId ?? ''}
              onChange={e => set({ mainLineOa: { ...(settings.mainLineOa ?? { token: '', channelId: '', channelSecret: '' }), targetId: e.target.value } })} />
            <p className="text-[11px] text-slate-400 mt-1">ปล่อยว่าง = Broadcast ให้ทุกคนที่แอดบอท</p>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Webhook URL <span className="text-slate-400 font-normal text-[11px]">(คัดลอกไปวางใน LINE Developer Console)</span></label>
            <div className="flex items-center gap-2">
              <code style={{ flex: 1, fontSize: 12, color: '#475569', background: '#f1f5f9', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all', border: '1px solid #e2e8f0' }}>
                {(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001').replace(/\/$/, '')}/api/line/webhook/main
              </code>
              <button type="button"
                onClick={() => { navigator.clipboard.writeText(`${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001').replace(/\/$/, '')}/api/line/webhook/main`); alert('คัดลอก Webhook URL แล้ว!') }}
                style={{ padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', cursor: 'pointer', flexShrink: 0 }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>content_copy</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">ใช้ config_id = <code className="bg-slate-100 px-1 rounded">main</code> สำหรับการเชื่อมต่อหลัก</p>
          </div>
        </div>
      </div>

      {/* 2. การแจ้งเตือนแต่ละโมดูล */}
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-icons-round" style={{ fontSize: 22, color: '#2563eb' }}>notifications</span>
          </div>
          <div>
            <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>ตั้งค่าการแจ้งเตือนแต่ละโมดูล</p>
            <p className="text-xs text-slate-400 mt-0.5">กำหนด LINE Group ID ที่จะรับการแจ้งเตือนของแต่ละระบบ</p>
          </div>
        </div>
        <div className="grid gap-3">
          {MODULE_LABELS.map(m => {
            const groupId = settings.moduleConnections?.[m.key] ?? ''
            const groupName = settings.moduleConnections?.[m.nameKey] ?? ''
            return (
              <div key={m.key} className="p-3 rounded-xl" style={{ background: '#f8fafc', border: `1px solid ${groupId ? '#bbf7d0' : '#e2e8f0'}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-icons-round" style={{ fontSize: 17, color: '#2563eb' }}>{m.icon}</span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1 }}>{m.label}</p>
                  {groupId ? <span style={{ fontSize: 11, fontWeight: 600, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 20 }}>เชื่อมต่อแล้ว</span>
                    : <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 20 }}>ยังไม่ได้ตั้งค่า</span>}
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 3 }}>ชื่อกลุ่ม (เพื่อความจำ)</label>
                    <input className="form-input" style={{ padding: '4px 10px', fontSize: 12, height: 32 }} placeholder="เช่น กลุ่มบัญชี, กลุ่มคลัง"
                      value={groupName} onChange={e => set({ moduleConnections: { ...mc, [m.nameKey]: e.target.value } })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 3 }}>LINE Group ID</label>
                    <input className="form-input" style={{ padding: '4px 10px', fontSize: 12, height: 32, fontFamily: 'monospace' }} placeholder="C1234567890abcdef"
                      value={groupId} onChange={e => set({ moduleConnections: { ...mc, [m.key]: e.target.value } })} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 p-3 rounded-lg" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <p className="text-xs text-blue-700 font-medium mb-1">วิธีหา LINE Group ID</p>
          <p className="text-[11px] text-blue-600">เพิ่มบอท LINE OA เข้ากลุ่ม → ให้ใครพิมพ์ข้อความในกลุ่ม → ดู Group ID จาก Backend Logs</p>
          <code className="text-[11px] text-blue-800 mt-1 block">docker-compose logs backend -f</code>
        </div>
      </div>

      {/* 3. การเชื่อมต่อเมล */}
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-icons-round" style={{ fontSize: 22, color: '#2563eb' }}>email</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>การเชื่อมต่อเมล</p>
            <p className="text-xs text-slate-400 mt-0.5">SMTP สำหรับส่ง OTP และการแจ้งเตือนทางอีเมล</p>
          </div>
          {!settings.smtpEmail && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fef9c3', color: '#a16207', fontSize: 12 }}>ยังไม่มีการแจ้งเตือนใด</span>}
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">อีเมลผู้ส่ง (SMTP Username)</label>
            <input type="email" className="form-input" placeholder="your-email@gmail.com" value={settings.smtpEmail ?? ''} onChange={e => set({ smtpEmail: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">App Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showSmtpPass ? 'text' : 'password'} className="form-input" placeholder="App password สำหรับ Gmail"
                value={settings.smtpPassword ?? ''} onChange={e => set({ smtpPassword: e.target.value })} style={{ paddingRight: 40 }} />
              <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <span className="material-icons-round" style={{ fontSize: 18 }}>{showSmtpPass ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>
          <div><label className="form-label">SMTP Server</label><input type="text" className="form-input" placeholder="smtp.gmail.com" value={settings.smtpServer ?? ''} onChange={e => set({ smtpServer: e.target.value })} /></div>
          <div><label className="form-label">SMTP Port</label><input type="number" className="form-input" placeholder="587" value={settings.smtpPort ?? 587} onChange={e => set({ smtpPort: Number(e.target.value) })} /></div>
        </div>
      </div>

      {/* 4. Budget Reminder */}
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-icons-round" style={{ fontSize: 22, color: '#ca8a04' }}>notifications_active</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-800" style={{ fontSize: 15 }}>การแจ้งเตือนตั้งงบประมาณ</p>
            <p className="text-xs text-slate-400 mt-0.5">ส่งข้อความ LINE ส่วนตัวไปยัง accounting_manager วันที่ 30 และวันที่ 4 ของเดือน</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">เปิดใช้</span>
            <button type="button" onClick={() => set({ budgetReminderEnabled: !settings.budgetReminderEnabled })}
              style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: settings.budgetReminderEnabled ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 3, left: settings.budgetReminderEnabled ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
          </div>
        </div>
        {settings.budgetReminderEnabled && (
          <div className="grid gap-4">
            <div>
              <label className="form-label">ข้อความวันที่ 30 <span className="ml-1 text-slate-400 font-normal">ใช้ [เดือน] แทนชื่อเดือน</span></label>
              <input type="text" className="form-input" value={settings.budgetReminderMessageDay30 ?? ''} onChange={e => set({ budgetReminderMessageDay30: e.target.value })} />
              <p className="text-[11px] text-slate-400 mt-1">ส่งทุกวันที่ 30 เวลา 08:00 น.</p>
            </div>
            <div>
              <label className="form-label">ข้อความวันที่ 4 <span className="ml-1 text-slate-400 font-normal">ใช้ [เดือน] แทนชื่อเดือน</span></label>
              <input type="text" className="form-input" value={settings.budgetReminderMessageDay4 ?? ''} onChange={e => set({ budgetReminderMessageDay4: e.target.value })} />
              <p className="text-[11px] text-slate-400 mt-1">ส่งวันที่ 4 เวลา 09:00 น. — เฉพาะกรณียังไม่ได้ตั้งงบ</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
              <p className="text-xs text-amber-700 font-medium mb-1">ต้องการ LINE Notify Token</p>
              <p className="text-[11px] text-amber-600">ผู้จัดการบัญชีต้องเชื่อมต่อ LINE Notify Token ในหน้าโปรไฟล์ก่อน</p>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      {msg && (
        <div className="mb-4 p-3 rounded-xl text-sm"
          style={{ background: msgType === 'ok' ? '#f0fdf4' : '#fef2f2', color: msgType === 'ok' ? '#15803d' : '#dc2626', border: `1px solid ${msgType === 'ok' ? '#bbf7d0' : '#fecaca'}` }}>
          <div className="flex items-center gap-2">
            <span className="material-icons-round" style={{ fontSize: 18 }}>{msgType === 'ok' ? 'check_circle' : 'error'}</span>
            <span className="font-medium">{msg}</span>
          </div>
        </div>
      )}
      {canManage && (
        <button className="btn-primary" onClick={onSave} disabled={saving}
          style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, borderRadius: 12 }}>
          <span className="material-icons-round" style={{ fontSize: 18 }}>save</span>
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าทั้งหมด'}
        </button>
      )}

      {/* LINE Config Modal */}
      <Modal open={!!(editLineMode && editLineConfig)} onClose={() => setEditLineMode(false)}
        title={editLineMode === 'add' ? 'เพิ่ม LINE Connection Note' : 'แก้ไข LINE Connection Note'} width={460}>
        {editLineConfig && (
          <>
            <div className="mb-4">
              <label className="form-label">ชื่อ Note <span className="text-red-500">*</span></label>
              <input type="text" className="form-input w-full" placeholder="เช่น แจ้งเตือนฝ่ายบัญชี"
                value={editLineConfig.name} onChange={e => setEditLineConfig(c => c ? { ...c, name: e.target.value } : null)} />
            </div>
            <div className="mb-4">
              <label className="form-label">Channel Access Token <span className="text-red-500">*</span></label>
              <div style={{ position: 'relative' }}>
                <input type={showLineToken ? 'text' : 'password'} className="form-input w-full" placeholder="Bearer Token..."
                  value={editLineConfig.token} onChange={e => setEditLineConfig(c => c ? { ...c, token: e.target.value } : null)} style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowLineToken(!showLineToken)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>{showLineToken ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label">Channel Secret (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input type={showLineSecret ? 'text' : 'password'} className="form-input w-full" placeholder="Secret..."
                  value={editLineConfig.channelSecret} onChange={e => setEditLineConfig(c => c ? { ...c, channelSecret: e.target.value } : null)} style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowLineSecret(!showLineSecret)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>{showLineSecret ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="form-label">Channel ID (Optional)</label>
                <input type="text" className="form-input w-full" placeholder="ID..."
                  value={editLineConfig.channelId} onChange={e => setEditLineConfig(c => c ? { ...c, channelId: e.target.value } : null)} />
              </div>
              <div>
                <label className="form-label">Target ID (สำหรับ Push)</label>
                <input type="text" className="form-input w-full" placeholder="Group ID / User ID"
                  value={editLineConfig.targetId} onChange={e => setEditLineConfig(c => c ? { ...c, targetId: e.target.value } : null)} />
                <p className="text-[10px] text-slate-400 mt-1">ปล่อยว่าง = Broadcast ให้ทุกคนที่แอดบอท</p>
              </div>
            </div>
            <div className="mb-6">
              <label className="form-label">ระบบสามารถใช้การเชื่อมต่อนี้ทำอะไรได้บ้าง</label>
              <select className="form-input w-full" value={editLineConfig.mode} onChange={e => setEditLineConfig(c => c ? { ...c, mode: e.target.value as any } : null)}>
                <option value="send">ส่งการแจ้งเตือนและการรายงาน (Push/Broadcast)</option>
                <option value="receive">รับข้อมูลอย่างเดียว</option>
                <option value="both">รองรับทั้งรับและส่ง</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center" onClick={handleSaveLineConfig}>
                เพิ่ม/อัปเดต Note <span className="text-xs ml-1">(อย่าลืมกด Save ใหญ่ด้านนอก)</span>
              </button>
              <button className="btn-secondary" onClick={() => setEditLineMode(false)}>ยกเลิก</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
