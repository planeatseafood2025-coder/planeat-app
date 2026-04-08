'use client'
import { useState, useEffect, useCallback } from 'react'
import { workspaceApi, settingsApi } from '@/lib/api'
import { ADMIN_ROLES, Role } from '@/types'
import { getSession } from '@/lib/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

interface Workspace { id: string; name: string; color: string; icon: string; lineOaConfigId: string }

interface LineOAConfig {
  id: string
  category: string
  name: string
  token: string
  channelId: string
  channelSecret: string
  mode: 'receive' | 'send' | 'both'
  targetId: string
}

interface GoogleSheetsMapping {
  name: string; email: string; phone: string
  company: string; type: string; note: string
  tags: string; lineUid: string
}

interface GoogleSheetsConfig {
  workspaceId: string
  spreadsheetId: string
  sheetName: string
  webhookSecret: string
  mapping: GoogleSheetsMapping
  enabled: boolean
}

const DEFAULT_GS_CONFIG: GoogleSheetsConfig = {
  workspaceId: '', spreadsheetId: '', sheetName: 'Sheet1',
  webhookSecret: '',
  mapping: { name: 'A', email: 'B', phone: 'C', company: 'D', type: 'E', note: 'F', tags: 'G', lineUid: 'H' },
  enabled: true,
}

const MODE_LABELS: Record<string, string> = {
  receive: 'รับข้อมูลอย่างเดียว',
  send:    'ส่งข้อมูลออกอย่างเดียว',
  both:    'ทั้งรับและส่ง (ทั้งสอง)',
}

// ── Source card component ────────────────────────────────────────
function SourceCard({
  icon, iconColor, iconBg, title, description, badge, badgeColor,
  children,
}: {
  icon: string; iconColor: string; iconBg: string
  title: string; description: string
  badge?: string; badgeColor?: string
  children?: React.ReactNode
}) {
  return (
    <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-icons-round" style={{ fontSize: 22, color: iconColor }}>{icon}</span>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{title}</p>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{description}</p>
        </div>
        {badge && (
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: badgeColor ? badgeColor + '20' : '#f1f5f9', color: badgeColor || '#94a3b8', fontWeight: 700 }}>
            {badge}
          </span>
        )}
      </div>
      {children && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid #f1f5f9' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function ConnectionsPage() {
  const session = getSession()
  const myRole = session?.role ?? ''
  const canManage = ADMIN_ROLES.includes(myRole as Role)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [wsId, setWsId]             = useState('')
  const [lineConfigs, setLineConfigs] = useState<LineOAConfig[]>([])
  const [loading, setLoading]       = useState(true)

  const [selectedLineId, setSelectedLineId] = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [copyDone, setCopyDone] = useState(false)

  // ── Connection Settings State (Ported from IT Access) ──
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [showManage, setShowManage] = useState(false)

  // Line OA Editor Modal state
  const [editingLineIndex, setEditingLineIndex] = useState<number | -1>(-1)
  const [lineEditor, setLineEditor] = useState<LineOAConfig | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Google Sheets state
  const [gsConfig, setGsConfig] = useState<GoogleSheetsConfig>(DEFAULT_GS_CONFIG)
  const [gsLoading, setGsLoading] = useState(false)
  const [gsSaving, setGsSaving] = useState(false)
  const [gsWebhookUrl, setGsWebhookUrl] = useState('')
  const [gsExpanded, setGsExpanded] = useState(false)
  const [gsCopied, setGsCopied] = useState(false)
  const [gsScriptCopied, setGsScriptCopied] = useState(false)

  // ── Load ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [wsRes, stRes] = await Promise.all([workspaceApi.getAll(), settingsApi.get()]) as any[]
      const ws: Workspace[] = wsRes.workspaces || []
      setWorkspaces(ws)
      setLineConfigs(stRes.lineOaConfigs || [])
      if (ws.length > 0) setWsId(ws[0].id)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  const loadGsConfig = useCallback(async () => {
    setGsLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''
      const [cfgRes, urlRes] = await Promise.all([
        fetch(`${API_BASE}/api/google-sheets/config`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/google-sheets/webhook-url`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (cfgRes.ok) {
        const data = await cfgRes.json()
        if (data.config && Object.keys(data.config).length > 0) {
          setGsConfig({ ...DEFAULT_GS_CONFIG, ...data.config, mapping: { ...DEFAULT_GS_CONFIG.mapping, ...(data.config.mapping || {}) } })
        }
      }
      if (urlRes.ok) {
        const urlData = await urlRes.json()
        setGsWebhookUrl(urlData.webhookUrl || '')
      }
    } catch { /* ignore */ }
    finally { setGsLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (showManage) loadGsConfig() }, [showManage, loadGsConfig])

  // Sync selectedLineId when workspace changes
  useEffect(() => {
    const ws = workspaces.find(w => w.id === wsId)
    setSelectedLineId(ws?.lineOaConfigId || '')
    setSaved(false)
  }, [wsId, workspaces])

  const currentWs = workspaces.find(w => w.id === wsId)
  const connectedLine = lineConfigs.find(l => l.id === currentWs?.lineOaConfigId)
  const webhookUrl = connectedLine ? `${API_BASE}/api/line/webhook/${connectedLine.id}` : ''

  async function saveLineSelection(newId: string) {
    if (!currentWs) return
    setSaving(true); setSaved(false)
    try {
      await workspaceApi.update(currentWs.id, { ...currentWs, lineOaConfigId: newId })
      const res = await workspaceApi.getAll() as any
      setWorkspaces(res.workspaces || [])
      setSelectedLineId(newId)
      setSaved(true)
    } catch (e: any) { alert(e.message || 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }

  // ── Management Handlers ──────────────────────────────────────────
  function openLineEditor(idx: number = -1) {
    if (idx >= 0) {
      setEditingLineIndex(idx)
      setLineEditor({ ...lineConfigs[idx] })
    } else {
      setEditingLineIndex(-1)
      setLineEditor({
        id: Math.random().toString(36).substring(2, 10),
        category: 'expense-control',
        name: '',
        token: '',
        channelId: '',
        channelSecret: '',
        mode: 'both',
        targetId: '',
      })
    }
  }

  async function saveLineEdit() {
    if (!lineEditor || !lineEditor.name) {
      alert('กรุณากรอกชื่อการเชื่อมต่อ')
      return
    }
    const newConfigs = [...lineConfigs]
    if (editingLineIndex >= 0) {
      newConfigs[editingLineIndex] = lineEditor
    } else {
      newConfigs.push(lineEditor)
    }
    setSettingsSaving(true)
    try {
      const res = await settingsApi.get() as any
      await settingsApi.update({ ...res.settings, lineOaConfigs: newConfigs })
      setLineConfigs(newConfigs)
      setLineEditor(null)
    } catch (e: any) { alert(e.message || 'บันทึกไม่สำเร็จ') }
    finally { setSettingsSaving(false) }
  }

  async function removeLineConfig(idx: number) {
    if (!confirm('ยืนยันลบการเชื่อมต่อนี้?')) return
    const newConfigs = [...lineConfigs]
    newConfigs.splice(idx, 1)
    setSettingsSaving(true)
    try {
      const res = await settingsApi.get() as any
      await settingsApi.update({ ...res.settings, lineOaConfigs: newConfigs })
      setLineConfigs(newConfigs)
    } catch (e: any) { alert(e.message || 'ลบไม่สำเร็จ') }
    finally { setSettingsSaving(false) }
  }

  async function handleSaveGsConfig() {
    setGsSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''
      const res = await fetch(`${API_BASE}/api/google-sheets/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(gsConfig),
      })
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ')
      alert('บันทึกการตั้งค่า Google Sheets สำเร็จ')
    } catch (e: any) { alert(e.message || 'บันทึกไม่สำเร็จ') }
    finally { setGsSaving(false) }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-3xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">การเชื่อมต่อการตลาด</h1>
          <p className="text-sm text-slate-500 mt-1">เชื่อมต่อช่องทางดึงข้อมูลลูกค้าเข้า CRM อัตโนมัติ</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowManage(!showManage)}
            style={{
              padding: '8px 16px', borderRadius: 10, background: showManage ? '#f8fafc' : '#7c3aed',
              color: showManage ? '#64748b' : 'white', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: showManage ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : '0 4px 12px rgba(124, 58, 237, 0.25)'
            }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>{showManage ? 'arrow_back' : 'settings'}</span>
            {showManage ? 'กลับหน้าเชื่อมต่อ' : 'จัดการช่องทางเชื่อมต่อ'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-16">กำลังโหลด...</div>
      ) : showManage ? (
        /* ════════════════════════════════════════════════════════════════════════
           MANAGEMENT UI (Ported from IT Access)
           ════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          {/* ── Line OA List ── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-icons-round" style={{ fontSize: 20, color: '#16a34a' }}>chat_bubble</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-800" style={{ fontSize: 14 }}>การเชื่อมต่อ Line OA</p>
                  <p className="text-xs text-slate-400 mt-0.5">เชื่อมต่อ Line Official Account เพื่อดึงข้อมูลลูกค้า</p>
                </div>
              </div>
              <button
                className="btn-secondary"
                onClick={() => openLineEditor(-1)}
                style={{
                  padding: '7px 14px', fontSize: 12, borderRadius: 10,
                  background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#1e293b', fontWeight: 700
                }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>add</span>
                เพิ่มการเชื่อมต่อ
              </button>
            </div>

            <div className="grid gap-3">
              {lineConfigs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', border: '2px dashed #e2e8f0', borderRadius: 12, color: '#94a3b8' }}>
                  ยังไม่มีการเชื่อมต่อ Line OA
                </div>
              ) : lineConfigs.map((cfg, idx) => (
                <div key={cfg.id} className="p-3 flex items-center justify-between border rounded-xl hover:border-blue-200 transition-colors bg-white">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-icons-round" style={{ fontSize: 20, color: '#16a34a' }}>chat</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800" style={{ fontSize: 14 }}>{cfg.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span style={{ fontSize: 10, padding: '1px 6px', background: cfg.mode === 'receive' ? '#fff7ed' : cfg.mode === 'send' ? '#f0f9ff' : '#f5f3ff', color: cfg.mode === 'receive' ? '#c2410c' : cfg.mode === 'send' ? '#0369a1' : '#6d28d9', borderRadius: 10, fontWeight: 700 }}>
                          {MODE_LABELS[cfg.mode] || cfg.mode}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openLineEditor(idx)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer' }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button onClick={() => removeLineConfig(idx)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#fff1f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer' }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>delete_outline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Google Sheets ── */}
          <div className="card">
            <button type="button" onClick={() => setGsExpanded(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="material-icons-round" style={{ fontSize: 20, color: '#16a34a' }}>table_chart</span>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <p className="font-semibold text-slate-800" style={{ fontSize: 14 }}>Google Sheets Auto-Import</p>
                <p className="text-xs text-slate-400 mt-0.5">นำเข้าลูกค้าจาก Google Sheets ผ่าน Apps Script Webhook</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {gsConfig.enabled && (
                  <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>เปิดใช้งาน</span>
                )}
                <span className="material-icons-round" style={{ fontSize: 20, color: '#94a3b8', transition: 'transform 0.2s', transform: gsExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
              </div>
            </button>

            {gsExpanded && (
              <div className="mt-6 space-y-4">
                {gsWebhookUrl && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: 14 }}>
                    <label className="form-label" style={{ color: '#166534', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>link</span>
                      Webhook URL
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                      <code style={{ flex: 1, fontSize: 11, background: 'white', border: '1px solid #bbf7d0', borderRadius: 6, padding: '7px 10px', color: '#166534', wordBreak: 'break-all' }}>
                        {gsWebhookUrl}
                      </code>
                      <button type="button"
                        onClick={() => { navigator.clipboard.writeText(gsWebhookUrl); setGsCopied(true); setTimeout(() => setGsCopied(false), 2000) }}
                        style={{ flexShrink: 0, padding: '7px 10px', borderRadius: 8, background: '#16a34a', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                        <span className="material-icons-round" style={{ fontSize: 14 }}>{gsCopied ? 'check' : 'content_copy'}</span>
                        คัดลอก URL
                      </button>
                    </div>
                    <button type="button"
                      onClick={() => {
                        const colIndex = (col: string) => col ? col.toUpperCase().charCodeAt(0) - 65 : -1
                        const m = gsConfig.mapping
                        const code = `// PlaNeat — Google Sheets Auto-Import
// วางโค้ดนี้ใน Google Apps Script แล้วตั้ง Trigger: onFormSubmit หรือ onChange

var WEBHOOK_URL = "${gsWebhookUrl}";
var WEBHOOK_SECRET = "${gsConfig.webhookSecret || ''}";
var SHEET_NAME = "${gsConfig.sheetName || 'Sheet1'}";

var COL = {
  name:    ${colIndex(m.name)},   // ${m.name || '-'}
  email:   ${colIndex(m.email)},   // ${m.email || '-'}
  phone:   ${colIndex(m.phone)},   // ${m.phone || '-'}
  company: ${colIndex(m.company)}, // ${m.company || '-'}
  type:    ${colIndex(m.type)},    // ${m.type || '-'}
  note:    ${colIndex(m.note)},    // ${m.note || '-'}
  tags:    ${colIndex(m.tags)},    // ${m.tags || '-'}
  lineUid: ${colIndex(m.lineUid)}, // ${m.lineUid || '-'}
};

function sendRowToPlaNeat(row) {
  function val(idx) { return idx >= 0 ? String(row[idx] || '').trim() : ''; }
  var payload = {
    name:    val(COL.name),
    email:   val(COL.email),
    phone:   val(COL.phone),
    company: val(COL.company),
    type:    val(COL.type) || 'B2C',
    note:    val(COL.note),
    tags:    val(COL.tags) ? val(COL.tags).split(',').map(function(t){return t.trim();}) : [],
    lineUid: val(COL.lineUid),
  };
  if (!payload.name) return;
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: WEBHOOK_SECRET ? { 'X-Webhook-Secret': WEBHOOK_SECRET } : {},
    muteHttpExceptions: true,
  };
  var res = UrlFetchApp.fetch(WEBHOOK_URL, options);
}

function onSheetChange(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var row = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  sendRowToPlaNeat(row);
}
`
                        navigator.clipboard.writeText(code)
                        setGsScriptCopied(true)
                        setTimeout(() => setGsScriptCopied(false), 2500)
                      }}
                      style={{ width: '100%', padding: '9px 14px', borderRadius: 8, background: '#1d4ed8', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <span className="material-icons-round" style={{ fontSize: 16 }}>{gsScriptCopied ? 'check_circle' : 'code'}</span>
                      {gsScriptCopied ? 'คัดลอกโค้ดแล้ว! นำไปวางใน Apps Script ได้เลย' : 'คัดลอกโค้ด Apps Script'}
                    </button>
                  </div>
                )}

                <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div>
                    <label className="form-label">Sheet Name</label>
                    <input type="text" className="form-input" placeholder="Sheet1" value={gsConfig.sheetName}
                      onChange={e => setGsConfig(c => ({ ...c, sheetName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Webhook Secret (optional)</label>
                    <input type="text" className="form-input" placeholder="รหัสลับเพื่อความปลอดภัย" value={gsConfig.webhookSecret}
                      onChange={e => setGsConfig(c => ({ ...c, webhookSecret: e.target.value }))} />
                  </div>
                </div>

                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', background: '#f8fafc', padding: 12, borderRadius: 12 }}>
                  {([
                    ['name', 'ชื่อลูกค้า *'], ['email', 'Email'], ['phone', 'เบอร์โทร'], ['company', 'บริษัท'],
                    ['type', 'B2B/B2C'], ['note', 'หมายเหตุ'], ['tags', 'Tags (,)'], ['lineUid', 'LINE UID']
                  ] as [keyof GoogleSheetsMapping, string][]).map(([field, label]) => (
                    <div key={field}>
                      <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 2 }}>{label}</label>
                      <input
                        type="text"
                        style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, textAlign: 'center', fontWeight: 700 }}
                        maxLength={1}
                        value={gsConfig.mapping[field]}
                        onChange={e => setGsConfig(c => ({ ...c, mapping: { ...c.mapping, [field]: e.target.value.toUpperCase() } }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={gsConfig.enabled}
                      onChange={e => setGsConfig(c => ({ ...c, enabled: e.target.checked }))} />
                    <span style={{ fontSize: 13, color: '#475569' }}>เปิดใช้งาน Auto-Import</span>
                  </label>
                </div>

                <button className="btn-primary" onClick={handleSaveGsConfig} disabled={gsSaving}
                  style={{ width: '100%', padding: '10px', fontSize: 13, borderRadius: 10 }}>
                  <span className="material-icons-round" style={{ fontSize: 16 }}>save</span>
                  {gsSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า Google Sheets'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <span className="material-icons-round" style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>business</span>
          ยังไม่มีธุรกิจ — ไปสร้างที่{' '}
          <a href="/customers" style={{ color: '#7c3aed', textDecoration: 'underline' }}>หน้าลูกค้า</a>
        </div>
      ) : (
        <>
          {/* Workspace tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {workspaces.map(ws => (
              <button key={ws.id} type="button" onClick={() => setWsId(ws.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px',
                  borderRadius: 24, border: wsId === ws.id ? `2px solid ${ws.color}` : '2px solid #e2e8f0',
                  background: wsId === ws.id ? ws.color + '15' : 'white',
                  color: wsId === ws.id ? ws.color : '#64748b',
                  fontWeight: wsId === ws.id ? 700 : 500, fontSize: 13, cursor: 'pointer',
                }}>
                <span className="material-icons-round" style={{ fontSize: 16 }}>{ws.icon || 'business'}</span>
                {ws.name}
              </button>
            ))}
          </div>

          {/* Source cards */}
          <div className="space-y-4">

            {/* ── LINE OA ── */}
            <SourceCard
              icon="chat_bubble" iconColor="#16a34a" iconBg="#dcfce7"
              title="LINE Official Account"
              description="ดึงลูกค้าเข้า CRM อัตโนมัติเมื่อ Follow OA"
              badge={connectedLine ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
              badgeColor={connectedLine ? '#16a34a' : undefined}
            >
              {lineConfigs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>ยังไม่มี LINE OA ที่ตั้งค่าไว้</p>
                  <button
                    onClick={() => setShowManage(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                      color: '#7c3aed', padding: '8px 16px', borderRadius: 8, background: '#f3f0ff',
                      border: 'none', cursor: 'pointer'
                    }}>
                    <span className="material-icons-round" style={{ fontSize: 15 }}>settings</span>
                    ไปที่การตั้งค่าจัดการช่องทาง
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* LINE OA cards */}
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>เลือก LINE OA ที่ต้องการเชื่อมกับ <span style={{ color: currentWs?.color }}>{currentWs?.name}</span></p>
                  <div className="space-y-2">
                    {lineConfigs.map(l => {
                      const selected = selectedLineId === l.id
                      return (
                        <label key={l.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                          borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                          border: selected ? `2px solid #16a34a` : '2px solid #f1f5f9',
                          background: selected ? '#f0fdf4' : '#fafafa',
                        }}>
                          <input type="radio" name="line_oa" value={l.id}
                            checked={selected}
                            onChange={() => setSelectedLineId(l.id)}
                            style={{ accentColor: '#16a34a', width: 16, height: 16 }} />
                          <span className="material-icons-round" style={{ fontSize: 20, color: selected ? '#16a34a' : '#94a3b8' }}>chat</span>
                          <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{l.name}</span>
                          {selected && currentWs?.lineOaConfigId === l.id && (
                            <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '2px 8px' }}>ใช้งานอยู่</span>
                          )}
                        </label>
                      )
                    })}
                    {/* Disconnect */}
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 12, cursor: 'pointer',
                      border: selectedLineId === '' ? '2px solid #fca5a5' : '2px solid #f1f5f9',
                      background: selectedLineId === '' ? '#fff1f2' : '#fafafa',
                    }}>
                      <input type="radio" name="line_oa" value=""
                        checked={selectedLineId === ''}
                        onChange={() => setSelectedLineId('')}
                        style={{ accentColor: '#dc2626', width: 16, height: 16 }} />
                      <span className="material-icons-round" style={{ fontSize: 20, color: selectedLineId === '' ? '#dc2626' : '#cbd5e1' }}>link_off</span>
                      <span style={{ fontSize: 14, color: selectedLineId === '' ? '#dc2626' : '#94a3b8' }}>ไม่เชื่อมต่อ</span>
                    </label>
                  </div>

                  {/* Save button */}
                  <button type="button"
                    disabled={saving || selectedLineId === (currentWs?.lineOaConfigId || '')}
                    onClick={() => saveLineSelection(selectedLineId)}
                    style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13,
                      cursor: saving || selectedLineId === (currentWs?.lineOaConfigId || '') ? 'not-allowed' : 'pointer',
                      background: selectedLineId === '' && currentWs?.lineOaConfigId ? '#dc2626' : '#16a34a',
                      color: 'white',
                      opacity: saving || selectedLineId === (currentWs?.lineOaConfigId || '') ? 0.5 : 1,
                    }}>
                    {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
                  </button>

                  {/* Webhook URL */}
                  {webhookUrl && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 14, marginTop: 4 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-icons-round" style={{ fontSize: 16 }}>link</span>
                        Webhook URL — วางใน LINE OA Console
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <code style={{ flex: 1, fontSize: 11, background: 'white', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', color: '#166534', wordBreak: 'break-all' }}>
                          {webhookUrl}
                        </code>
                        <button type="button"
                          onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopyDone(true); setTimeout(() => setCopyDone(false), 2000) }}
                          style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 8, background: '#16a34a', border: 'none', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="material-icons-round" style={{ fontSize: 14 }}>{copyDone ? 'check' : 'content_copy'}</span>
                          {copyDone ? 'คัดลอกแล้ว' : 'คัดลอก'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SourceCard>

            {/* ── Coming soon ── */}
            {[
              { icon: 'groups',      iconColor: '#1877f2', iconBg: '#eff6ff', title: 'Facebook Messenger', description: 'รับลูกค้าจาก Facebook Page Messages', badge: 'รอ Meta Review' },
              { icon: 'photo_camera',iconColor: '#e1306c', iconBg: '#fff0f6', title: 'Instagram DM',        description: 'รับลูกค้าจาก Instagram Direct Message', badge: 'รอ Meta Review' },
              { icon: 'storefront',  iconColor: '#ff6700', iconBg: '#fff7ed', title: 'Shopee / TikTok Shop',description: 'ดึงข้อมูลลูกค้าจาก e-Commerce', badge: 'เร็วๆ นี้' },
            ].map(src => (
              <div key={src.title} style={{ opacity: 0.45 }}>
                <SourceCard
                  icon={src.icon} iconColor={src.iconColor} iconBg={src.iconBg}
                  title={src.title} description={src.description}
                  badge={src.badge}
                />
              </div>
            ))}

          </div>
        </>
      )}

      {/* ── Line OA Editor Modal ── */}
      {lineEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 500, boxShadow: '0 20px 80px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">
                {editingLineIndex >= 0 ? 'แก้ไขการเชื่อมต่อ' : 'เพิ่มการเชื่อมต่อ Line OA'}
              </h3>
              <button onClick={() => setLineEditor(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="grid gap-5">
              <div>
                <label className="form-label">ชื่อการเชื่อมต่อ (เช่น "บัญชีรับแจ้ง")</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ตั้งชื่อเพื่อให้จำง่าย"
                  value={lineEditor.name}
                  onChange={e => setLineEditor({ ...lineEditor, name: e.target.value })}
                />
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label className="form-label">หมวดหมู่ระบบ</label>
                  <select
                    className="form-input"
                    value={lineEditor.category}
                    onChange={e => setLineEditor({ ...lineEditor, category: e.target.value })}
                  >
                    <option value="expense-control">ระบบควบคุมค่าใช้จ่าย</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">รูปแบบการทำงาน</label>
                  <select
                    className="form-input"
                    value={lineEditor.mode}
                    onChange={e => setLineEditor({ ...lineEditor, mode: e.target.value as any })}
                  >
                    <option value="receive">รับข้อมูลอย่างเดียว</option>
                    <option value="send">ส่งข้อมูลออกอย่างเดียว</option>
                    <option value="both">ทั้งรับและส่ง (ทั้งสอง)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Line OA Channel Access Token</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showToken ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Channel Access Token"
                    value={lineEditor.token}
                    onChange={e => setLineEditor({ ...lineEditor, token: e.target.value })}
                    style={{ paddingRight: 40 }}
                  />
                  <button type="button" onClick={() => setShowToken(!showToken)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                    <span className="material-icons-round" style={{ fontSize: 18 }}>{showToken ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label className="form-label">Channel ID</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ID"
                    value={lineEditor.channelId}
                    onChange={e => setLineEditor({ ...lineEditor, channelId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Channel Secret</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Secret"
                      value={lineEditor.channelSecret}
                      onChange={e => setLineEditor({ ...lineEditor, channelSecret: e.target.value })}
                      style={{ paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                      <span className="material-icons-round" style={{ fontSize: 18 }}>{showSecret ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Webhook URL */}
              {editingLineIndex >= 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: 14 }}>
                  <label className="form-label" style={{ color: '#166534', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-icons-round" style={{ fontSize: 16 }}>link</span>
                    Webhook URL (นำไปใส่ใน LINE Developers Console)
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{ flex: 1, fontSize: 11, background: 'white', border: '1px solid #bbf7d0', borderRadius: 6, padding: '7px 10px', color: '#166534', wordBreak: 'break-all', display: 'block' }}>
                      {`${API_BASE}/api/line/webhook/${lineEditor.id}`}
                    </code>
                    <button type="button"
                      onClick={() => navigator.clipboard.writeText(`${API_BASE}/api/line/webhook/${lineEditor.id}`)}
                      style={{ flexShrink: 0, padding: '7px 10px', borderRadius: 8, background: '#16a34a', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <span className="material-icons-round" style={{ fontSize: 14 }}>content_copy</span>
                      คัดลอก
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Target ID (Group ID / User ID)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="C... (Group) หรือ U... (User)"
                  value={lineEditor.targetId}
                  onChange={e => setLineEditor({ ...lineEditor, targetId: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button className="btn-primary flex-1 justify-center py-3" onClick={saveLineEdit} disabled={settingsSaving}>
                  {settingsSaving ? 'กำลังบันทึก...' : 'ตกลง'}
                </button>
                <button className="btn-secondary flex-1 justify-center py-3" onClick={() => setLineEditor(null)}>ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
