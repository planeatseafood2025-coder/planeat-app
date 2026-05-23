'use client'
import { useState, useEffect } from 'react'
import { agentApi, skillApi } from '@/lib/api'

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter', hint: 'แนะนำ — รองรับหลาย model รวมถึง model ฟรี', keyLink: 'https://openrouter.ai/keys' },
  { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'Claude — ฉลาดที่สุด เหมาะกับงานซับซ้อน', keyLink: 'https://console.anthropic.com/keys' },
  { value: 'openai', label: 'OpenAI (GPT)', hint: 'GPT — ยอดนิยม เสถียร', keyLink: 'https://platform.openai.com/api-keys' },
  { value: 'google', label: 'Google (Gemini)', hint: 'Gemini — context ยาว ราคาถูก', keyLink: 'https://aistudio.google.com/app/apikey' },
]

const PERSONALITY_EXAMPLES: Record<string, string> = {
  friendly: '"สวัสดีครับ! มีอะไรให้ช่วยไหมครับ? 😊"',
  formal: '"สวัสดีครับ ผมพร้อมให้บริการครับ"',
  concise: '"สวัสดี มีอะไรให้ช่วย?"',
}

const ALL_TOOLS = ['getDeals','getAccounts','getContacts','getActivities','getReminders','createReminder','logActivity','createContact','sendPreviewEmail','sendEmail']

const TOOL_DESC: Record<string, string> = {
  getDeals: 'ดึงรายการ deals', getAccounts: 'ดึงรายชื่อบริษัท/ลูกค้า',
  getContacts: 'ดึงรายชื่อบุคคลติดต่อ', getActivities: 'ดูประวัติกิจกรรม',
  getReminders: 'ดูรายการ reminders', createReminder: 'สร้าง reminder',
  logActivity: 'บันทึกกิจกรรม', createContact: 'สร้างรายชื่อใหม่',
  sendPreviewEmail: 'ดูตัวอย่างอีเมล', sendEmail: 'ส่งอีเมลจริง',
}

interface Agent { id: string; name: string; avatar: string; is_manager?: boolean }

interface SettingsPanelProps {
  agent: Agent | null
  onDelete: (agentId: string) => void
  onSaved: () => void
}

export default function SettingsPanel({ agent, onDelete, onSaved }: SettingsPanelProps) {
  const [config, setConfig] = useState<any>(null)
  const [skills, setSkills] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!agent) { setConfig(null); return }
    agentApi.getConfig(agent.id).then((r: any) => setConfig(r)).catch(() => {})
    skillApi.list().then((r: any) => setSkills(r.skills || [])).catch(() => {})
  }, [agent?.id])

  async function handleSave() {
    if (!config || !agent) return
    setSaving(true)
    try {
      await agentApi.updateConfig(agent.id, config)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
    setSaving(false)
  }

  function set(key: string, val: any) {
    setConfig((c: any) => ({ ...c, [key]: val }))
  }

  function toggleTool(tool: string) {
    setConfig((c: any) => ({
      ...c,
      tools_enabled: c.tools_enabled?.includes(tool)
        ? c.tools_enabled.filter((t: string) => t !== tool)
        : [...(c.tools_enabled || []), tool],
    }))
  }

  function toggleSkill(skillId: string) {
    setConfig((c: any) => ({
      ...c,
      skill_ids: c.skill_ids?.includes(skillId)
        ? c.skill_ids.filter((s: string) => s !== skillId)
        : [...(c.skill_ids || []), skillId],
    }))
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-ai-text-muted text-sm">
        เลือก agent ทางซ้ายเพื่อตั้งค่า
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center text-ai-text-muted text-sm">
        กำลังโหลด...
      </div>
    )
  }

  const provider = PROVIDERS.find(p => p.value === config.provider) || PROVIDERS[0]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-ai-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{agent.avatar}</span>
          <div>
            <h2 className="text-base font-bold text-ai-text">{agent.name}</h2>
            <p className="text-xs text-ai-text-muted">{agent.id}</p>
          </div>
        </div>
        {!config.is_manager && (
          <button
            onClick={() => { if (confirm(`ลบ "${agent.name}" ใช่ไหม?`)) onDelete(agent.id) }}
            className="p-2 rounded-lg text-ai-error hover:bg-ai-error-bg transition-colors"
            title="ลบ agent"
          >
            🗑️
          </button>
        )}
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Group 1: Model Configuration */}
        <div className="bg-white border border-ai-border rounded-[14px] p-5 space-y-4">
          <h3 className="text-sm font-bold text-ai-text flex items-center gap-2">
            LLM Provider
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">🚀 เริ่มที่นี่ก่อน</span>
          </h3>
          <div>
            <label className="block text-xs font-semibold text-ai-text-muted mb-1">Provider</label>
            <select value={config.provider || 'openrouter'}
              onChange={e => set('provider', e.target.value)}
              className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm text-ai-text focus:outline-none focus:border-ai-primary bg-white">
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <p className="text-xs text-ai-text-muted mt-1">💡 {provider.hint}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ai-text-muted mb-1">Model</label>
            <input value={config.model || ''} onChange={e => set('model', e.target.value)}
              className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm text-ai-text focus:outline-none focus:border-ai-primary font-mono"
              placeholder="openai/gpt-4o-mini" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ai-text-muted mb-1">API Key</label>
            <input type="password" value={config.api_key || ''} onChange={e => set('api_key', e.target.value)}
              className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm text-ai-text focus:outline-none focus:border-ai-primary font-mono"
              placeholder={provider.value === 'openrouter' ? 'sk-or-...' : 'sk-...'} />
            <p className="text-xs mt-1">
              <a href={provider.keyLink} target="_blank" rel="noopener noreferrer"
                className="text-ai-primary font-semibold hover:underline">รับ API Key ได้ที่นี่ →</a>
            </p>
          </div>
        </div>

        {/* Group 2: Identity */}
        <div className="bg-white border border-ai-border rounded-[14px] p-5 space-y-4">
          <h3 className="text-sm font-bold text-ai-text">ข้อมูลพื้นฐาน</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">ชื่อ</label>
              <input value={config.name || ''} onChange={e => set('name', e.target.value)}
                className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm text-ai-text focus:outline-none focus:border-ai-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">Avatar (emoji)</label>
              <input value={config.avatar || ''} onChange={e => set('avatar', e.target.value)}
                className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm text-ai-text focus:outline-none focus:border-ai-primary" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ai-text-muted mb-1">บุคลิก</label>
            <select value={config.personality || 'friendly'} onChange={e => set('personality', e.target.value)}
              className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm text-ai-text focus:outline-none focus:border-ai-primary bg-white">
              <option value="friendly">😊 Friendly — เป็นมิตร</option>
              <option value="formal">🎩 Formal — เป็นทางการ</option>
              <option value="concise">⚡ Concise — กระชับ</option>
            </select>
            {PERSONALITY_EXAMPLES[config.personality] && (
              <p className="text-xs text-ai-text-muted mt-1 italic bg-gray-50 px-3 py-1.5 rounded-lg">
                ตัวอย่าง: {PERSONALITY_EXAMPLES[config.personality]}
              </p>
            )}
          </div>
        </div>

        {/* Group 3: Skills */}
        <div className="bg-white border border-ai-border rounded-[14px] p-5 space-y-3">
          <h3 className="text-sm font-bold text-ai-text">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {skills.map(s => (
              <button key={s.skill_id} onClick={() => toggleSkill(s.skill_id)}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  config.skill_ids?.includes(s.skill_id)
                    ? 'bg-blue-50 text-ai-primary border-ai-primary'
                    : 'bg-white text-ai-text-muted border-ai-border hover:border-ai-primary'
                }`}
                title={s.description}>
                {config.skill_ids?.includes(s.skill_id) ? '✓ ' : ''}{s.name}
              </button>
            ))}
            {skills.length === 0 && <p className="text-xs text-ai-text-muted">ยังไม่มี skills</p>}
          </div>
        </div>

        {/* Group 4: Tools */}
        <div className="bg-white border border-ai-border rounded-[14px] p-5 space-y-3">
          <h3 className="text-sm font-bold text-ai-text">Tools</h3>
          <p className="text-xs text-ai-text-muted">Hover เพื่อดูคำอธิบาย</p>
          <div className="flex flex-wrap gap-2">
            {ALL_TOOLS.map(tool => (
              <button key={tool} onClick={() => toggleTool(tool)}
                title={TOOL_DESC[tool]}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  config.tools_enabled?.includes(tool)
                    ? 'bg-blue-50 text-ai-primary border-ai-primary'
                    : 'bg-white text-ai-text-muted border-ai-border hover:border-ai-primary'
                }`}>
                {config.tools_enabled?.includes(tool) ? '✓ ' : ''}{tool}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className={`w-full py-3 rounded-[14px] font-bold text-sm text-white transition-colors ${
            saved ? 'bg-green-500' : 'bg-ai-primary hover:bg-ai-primary-hover'
          } disabled:opacity-50`}>
          {saved ? '✓ บันทึกแล้ว' : saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </button>
      </div>
    </div>
  )
}
