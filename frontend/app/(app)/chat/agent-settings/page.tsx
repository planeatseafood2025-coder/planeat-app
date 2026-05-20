'use client'
import { useState, useEffect } from 'react'
import { agentApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { useRouter } from 'next/navigation'

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)', models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'] },
  { value: 'openai', label: 'OpenAI (GPT)', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { value: 'google', label: 'Google (Gemini)', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { value: 'openrouter', label: 'OpenRouter', models: ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.3-70b-instruct:free', 'mistralai/mistral-7b-instruct:free', 'anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini'] },
]

const ALL_TOOLS = ['getDeals','getAccounts','getContacts','getActivities','getReminders','createReminder','logActivity','createContact','sendPreviewEmail','sendEmail']

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

export default function AgentSettingsPage() {
  const session = getSession()
  const router = useRouter()
  const IT_ROLES = ['admin', 'it_manager', 'super_admin']

  useEffect(() => {
    if (session && !IT_ROLES.includes(session.role)) {
      router.push('/chat')
    }
  }, [session, router])

  const [config, setConfig] = useState<any>({
    id: 'marketing_agent_1',
    name: 'PlaNeat AI (การตลาด)',
    avatar: '🤖',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    api_key: '',
    personality: 'friendly',
    tools_enabled: ALL_TOOLS,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    agentApi.getConfig('marketing_agent_1').then((r: any) => setConfig(r)).catch(() => {})
  }, [])

  const selectedProvider = PROVIDERS.find(p => p.value === config.provider) || PROVIDERS[0]

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
      await agentApi.updateConfig('marketing_agent_1', config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      alert(e.message || 'เกิดข้อผิดพลาด')
    }
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
          {/* Basic info */}
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
            </div>
          </div>

          {/* LLM Provider */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>LLM Provider</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Provider</label>
              <select value={config.provider} onChange={e => setConfig((c: any) => ({ ...c, provider: e.target.value, model: PROVIDERS.find(p => p.value === e.target.value)?.models[0] || '' }))} style={inputStyle}>
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Model</label>
              <select value={config.model} onChange={e => setConfig((c: any) => ({ ...c, model: e.target.value }))} style={inputStyle}>
                {selectedProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>API Key</label>
              <input type="password" value={config.api_key || ''} onChange={e => setConfig((c: any) => ({ ...c, api_key: e.target.value }))} placeholder="sk-ant-... หรือ sk-..." style={inputStyle} />
            </div>
          </div>

          {/* Tools */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>Tools ที่เปิดใช้</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_TOOLS.map(tool => (
                <button key={tool} onClick={() => toggleTool(tool)}
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
