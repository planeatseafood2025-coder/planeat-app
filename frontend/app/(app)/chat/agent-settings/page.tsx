'use client'
import { useState, useEffect, Suspense } from 'react'
import { agentApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)', models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'] },
  { value: 'openai', label: 'OpenAI (GPT)', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { value: 'google', label: 'Google (Gemini)', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { value: 'openrouter', label: 'OpenRouter', models: [] },
]

const ALL_TOOLS = ['getDeals','getAccounts','getContacts','getActivities','getReminders','createReminder','logActivity','createContact','sendPreviewEmail','sendEmail']

const PROVIDER_DESC: Record<string, string> = {
  openrouter: 'แนะนำ — รองรับหลาย model รวมถึง model ฟรี',
  anthropic: 'Claude — ฉลาดที่สุด เหมาะกับงานซับซ้อน',
  openai: 'GPT — ยอดนิยม เสถียร',
  google: 'Gemini — context ยาว ราคาถูก',
}

const API_KEY_LINKS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/keys',
  anthropic: 'https://console.anthropic.com/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/app/apikey',
}

const PERSONALITY_EXAMPLES: Record<string, string> = {
  friendly: '"สวัสดีครับ! มีอะไรให้ช่วยไหมครับ? 😊"',
  formal: '"สวัสดีครับ ผมพร้อมให้บริการครับ"',
  concise: '"สวัสดี มีอะไรให้ช่วย?"',
}

const TOOL_DESC: Record<string, string> = {
  getDeals: 'ดึงรายการ deals/โอกาสการขาย',
  getAccounts: 'ดึงรายชื่อบริษัท/ลูกค้า',
  getContacts: 'ดึงรายชื่อบุคคลติดต่อ',
  getActivities: 'ดูประวัติกิจกรรมและการติดต่อ',
  getReminders: 'ดูรายการ reminders',
  createReminder: 'สร้าง reminder ใหม่',
  logActivity: 'บันทึกกิจกรรม เช่น โทรหาลูกค้า',
  createContact: 'สร้างรายชื่อติดต่อใหม่',
  sendPreviewEmail: 'ดูตัวอย่างอีเมลก่อนส่ง',
  sendEmail: 'ส่งอีเมลจริง (ระวัง)',
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

function AgentSettingsContent() {
  const session = getSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const agentId = searchParams.get('agentId') || 'marketing_agent_1'
  const IT_ROLES = ['admin', 'it_manager', 'super_admin']

  useEffect(() => {
    if (session && !IT_ROLES.includes(session.role)) router.push('/chat')
  }, [session, router])

  const [config, setConfig] = useState<any>({
    id: agentId, name: '', avatar: '🤖',
    provider: 'openrouter', model: 'openai/gpt-4o-mini', api_key: '',
    personality: 'friendly', tools_enabled: ALL_TOOLS,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orOpen, setOrOpen] = useState(false)
  const [orModels, setOrModels] = useState<{ id: string; name: string; pricing?: any }[]>([])
  const [orSearch, setOrSearch] = useState('')
  const [orLoading, setOrLoading] = useState(false)
  const [orError, setOrError] = useState('')

  useEffect(() => {
    agentApi.getConfig(agentId).then((r: any) => setConfig(r)).catch(() => {})
  }, [agentId])

  // Fetch OpenRouter models when provider = openrouter
  useEffect(() => {
    if (config.provider !== 'openrouter') return
    setOrLoading(true)
    setOrError('')
    fetch('https://openrouter.ai/api/v1/models')
      .then(r => r.json())
      .then(data => {
        const models = (data.data || []).sort((a: any, b: any) => a.id.localeCompare(b.id))
        setOrModels(models)
        setOrLoading(false)
      })
      .catch(() => {
        setOrError('โหลด model ไม่ได้ กรุณาพิมพ์ชื่อเอง')
        setOrLoading(false)
      })
  }, [config.provider])

  const selectedProvider = PROVIDERS.find(p => p.value === config.provider) || PROVIDERS[0]

  const filteredOrModels = orModels.filter(m =>
    m.id.toLowerCase().includes(orSearch.toLowerCase()) ||
    (m.name || '').toLowerCase().includes(orSearch.toLowerCase())
  )
  const freeOrModels = filteredOrModels.filter(m => m.id.endsWith(':free'))
  const paidOrModels = filteredOrModels.filter(m => !m.id.endsWith(':free'))

  function toggleTool(tool: string) {
    setConfig((c: any) => ({
      ...c,
      tools_enabled: c.tools_enabled.includes(tool)
        ? c.tools_enabled.filter((t: string) => t !== tool)
        : [...c.tools_enabled, tool],
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await agentApi.updateConfig(agentId, config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
    setSaving(false)
  }

  if (session && !IT_ROLES.includes(session.role)) return null

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>ตั้งค่า AI Agent</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Marketing Agent — เฉพาะ IT Manager เท่านั้น</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* LLM Provider — อันดับ 1 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>LLM Provider</h3>
              <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>🚀 เริ่มที่นี่ก่อน</span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Provider</label>
              <select value={config.provider} onChange={e => {
                const prov = e.target.value
                const firstModel = PROVIDERS.find(p => p.value === prov)?.models[0] || ''
                setConfig((c: any) => ({ ...c, provider: prov, model: firstModel }))
                setOrSearch('')
              }} style={inputStyle}>
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {PROVIDER_DESC[config.provider] && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>💡 {PROVIDER_DESC[config.provider]}</p>
              )}
            </div>

            {/* Model selector */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Model</label>

              {config.provider === 'openrouter' ? (
                <div>
                  {/* Selected model button — click to open/close */}
                  <div onClick={() => setOrOpen(o => !o)}
                    style={{ ...inputStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', userSelect: 'none' }}>
                    <span style={{ color: config.model ? '#1e293b' : '#94a3b8', fontSize: 13 }}>
                      {config.model || 'เลือก model...'}
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{orOpen ? '▲' : '▼'}</span>
                  </div>

                  {/* Dropdown */}
                  {orOpen && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4, background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                      <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>
                        <input
                          autoFocus
                          value={orSearch}
                          onChange={e => setOrSearch(e.target.value)}
                          placeholder="ค้นหา model เช่น gemini, llama, claude..."
                          style={{ ...inputStyle, margin: 0 }}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        {orLoading ? (
                          <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>กำลังโหลด model...</div>
                        ) : orError ? (
                          <div style={{ padding: 12, color: '#ef4444', fontSize: 12 }}>{orError}</div>
                        ) : (
                          <>
                            {freeOrModels.length > 0 && (
                              <>
                                <div style={{ padding: '6px 12px', background: '#f0fdf4', fontSize: 11, fontWeight: 700, color: '#15803d', position: 'sticky', top: 0 }}>
                                  ✦ ฟรี ({freeOrModels.length} model)
                                </div>
                                {freeOrModels.map(m => (
                                  <div key={m.id} onClick={() => { setConfig((c: any) => ({ ...c, model: m.id })); setOrOpen(false); setOrSearch('') }}
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: config.model === m.id ? '#eff6ff' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: config.model === m.id ? '#1d4ed8' : '#1e293b' }}>{m.id}</div>
                                      {m.name && m.name !== m.id && <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.name}</div>}
                                    </div>
                                    {config.model === m.id && <span style={{ color: '#2563eb' }}>✓</span>}
                                  </div>
                                ))}
                              </>
                            )}
                            {paidOrModels.length > 0 && (
                              <>
                                <div style={{ padding: '6px 12px', background: '#fef3c7', fontSize: 11, fontWeight: 700, color: '#92400e', position: 'sticky', top: 0 }}>
                                  💳 มีค่าใช้จ่าย ({paidOrModels.length} model)
                                </div>
                                {paidOrModels.map(m => (
                                  <div key={m.id} onClick={() => { setConfig((c: any) => ({ ...c, model: m.id })); setOrOpen(false); setOrSearch('') }}
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: config.model === m.id ? '#eff6ff' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: config.model === m.id ? '#1d4ed8' : '#1e293b' }}>{m.id}</div>
                                      {m.name && m.name !== m.id && <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.name}</div>}
                                    </div>
                                    {config.model === m.id && <span style={{ color: '#2563eb' }}>✓</span>}
                                  </div>
                                ))}
                              </>
                            )}
                            {filteredOrModels.length === 0 && (
                              <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>ไม่พบ model ที่ค้นหา</div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <select value={config.model} onChange={e => setConfig((c: any) => ({ ...c, model: e.target.value }))} style={inputStyle}>
                  {selectedProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>API Key</label>
              <input type="password" value={config.api_key || ''} onChange={e => setConfig((c: any) => ({ ...c, api_key: e.target.value }))}
                placeholder={config.provider === 'openrouter' ? 'sk-or-...' : config.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                style={inputStyle} />
              {API_KEY_LINKS[config.provider] && (
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                  <a href={API_KEY_LINKS[config.provider]} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                    รับ API Key ได้ที่นี่ →
                  </a>
                </p>
              )}
            </div>
          </div>

          {/* Basic info — อันดับ 2 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>ข้อมูลพื้นฐาน</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อ Agent</label>
                <input value={config.name} onChange={e => setConfig((c: any) => ({ ...c, name: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Avatar (emoji)</label>
                <input value={config.avatar} onChange={e => setConfig((c: any) => ({ ...c, avatar: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บุคลิก</label>
              <select value={config.personality} onChange={e => setConfig((c: any) => ({ ...c, personality: e.target.value }))} style={inputStyle}>
                <option value="friendly">😊 Friendly — เป็นมิตร ใช้ emoji</option>
                <option value="formal">🎩 Formal — สุภาพ เป็นทางการ</option>
                <option value="concise">⚡ Concise — สั้น กระชับ</option>
              </select>
              {PERSONALITY_EXAMPLES[config.personality] && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                  ตัวอย่าง: {PERSONALITY_EXAMPLES[config.personality]}
                </p>
              )}
            </div>
          </div>

          {/* Tools — อันดับ 3 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>Tools ที่เปิดใช้</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>Hover บน tool เพื่อดูคำอธิบาย</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_TOOLS.map(tool => (
                <button key={tool} onClick={() => toggleTool(tool)}
                  title={TOOL_DESC[tool] || tool}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid', borderColor: config.tools_enabled?.includes(tool) ? '#2563eb' : '#e2e8f0', background: config.tools_enabled?.includes(tool) ? '#eff6ff' : '#fff', color: config.tools_enabled?.includes(tool) ? '#1d4ed8' : '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  {config.tools_enabled?.includes(tool) ? '✓ ' : ''}{tool}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            style={{ padding: '12px', background: saved ? '#10b981' : '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saved ? '✓ บันทึกแล้ว' : saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AgentSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8' }}>กำลังโหลด...</div>}>
      <AgentSettingsContent />
    </Suspense>
  )
}
