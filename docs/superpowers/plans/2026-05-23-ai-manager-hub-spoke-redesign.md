# AI Manager Hub & Spoke Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลบหน้า AI เดิม 3 หน้า แล้วสร้าง `/ai-manager` ใหม่เป็น Hub & Spoke dashboard — org chart ซ้าย, settings panel ขวา, activity feed ล่าง

**Architecture:** Frontend-only สำหรับ UI (Next.js 14 + Tailwind ที่มีอยู่แล้ว) + Backend เพิ่ม activity endpoint ใหม่ แยก component ออกเป็น 4 ไฟล์ย่อย + 1 main page

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (มีอยู่แล้ว), FastAPI, MongoDB

---

## File Map

**ลบ:**
- `frontend/app/(app)/ai-manager/page.tsx`
- `frontend/app/(app)/ai-manager/skills/page.tsx`
- `frontend/app/(app)/chat/agent-settings/page.tsx`

**สร้างใหม่:**
- `frontend/app/(app)/ai-manager/page.tsx` — main page (shell layout + state)
- `frontend/app/(app)/ai-manager/_components/OrgChart.tsx` — left panel org chart
- `frontend/app/(app)/ai-manager/_components/SettingsPanel.tsx` — right panel settings
- `frontend/app/(app)/ai-manager/_components/CreateAgentModal.tsx` — modal สร้าง agent
- `frontend/app/(app)/ai-manager/_components/ActivityFeed.tsx` — bottom ticker

**แก้ไข:**
- `frontend/tailwind.config.ts` — เพิ่ม AI color palette
- `frontend/lib/api.ts` — เพิ่ม `agentApi.getActivity()`
- `backend/app/routers/agent.py` — เพิ่ม `GET /api/agent/activity`
- `backend/app/services/agent_service.py` — เพิ่ม `log_activity()`

---

### Task 1: เพิ่ม AI color palette ใน Tailwind config

**Files:**
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1: เพิ่ม colors ใน theme.extend.colors**

เปิด `frontend/tailwind.config.ts` หา `colors: {` แล้วเพิ่ม ai colors ต่อท้าย colors object ที่มีอยู่:

```typescript
// เพิ่มใน theme.extend.colors ต่อจาก repair block:
'ai-primary': '#004ac6',
'ai-primary-hover': '#003ea8',
'ai-surface': '#f7f9fb',
'ai-card': '#ffffff',
'ai-border': '#e2e8f0',
'ai-active': '#10b981',
'ai-idle': '#94a3b8',
'ai-text': '#191c1e',
'ai-text-muted': '#64748b',
'ai-error': '#ba1a1a',
'ai-error-bg': '#ffdad6',
'ai-badge-bg': '#dbe1ff',
'ai-badge-text': '#003ea8',
```

และเพิ่ม keyframe marquee ใน keyframes object:
```typescript
marquee: {
  '0%': { transform: 'translateX(100%)' },
  '100%': { transform: 'translateX(-200%)' },
},
```

และเพิ่มใน animation:
```typescript
marquee: 'marquee 30s linear infinite',
```

- [ ] **Step 2: ตรวจสอบว่า build ผ่าน**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add frontend/tailwind.config.ts
git commit -m "feat(ai-manager): add AI color palette and marquee animation to Tailwind config"
```

---

### Task 2: Backend — เพิ่ม Activity endpoint

**Files:**
- Modify: `backend/app/services/agent_service.py`
- Modify: `backend/app/routers/agent.py`

**Context:** `agent_service.py` มี function `run_agent()` ที่ dispatch tool calls ใน agentic loop ต้องเพิ่ม `log_activity()` และเรียกมันหลัง tool สำเร็จ

- [ ] **Step 1: เพิ่ม `log_activity()` ใน agent_service.py**

เปิด `backend/app/services/agent_service.py` เพิ่ม function นี้ก่อน `run_agent()`:

```python
async def log_activity(agent_id: str, agent_name: str, agent_avatar: str, message: str):
    """Append one activity record to agent_activity collection."""
    from ..database import get_db
    import datetime
    db = get_db()
    await db.agent_activity.insert_one({
        "agent_id": agent_id,
        "agent_name": agent_name,
        "agent_avatar": agent_avatar,
        "message": message,
        "timestamp": datetime.datetime.utcnow(),
    })
```

- [ ] **Step 2: เรียก log_activity หลัง agent ส่ง reply**

ใน `run_agent()` ใน `agent_service.py` หาบรรทัด `return {"reply": ...}` แล้วเพิ่มก่อน return:

```python
# log activity
try:
    await log_activity(
        agent_id=req.agent_id,
        agent_name=config.name,
        agent_avatar=config.avatar,
        message=f"ตอบกลับ: {reply[:80]}{'...' if len(reply) > 80 else ''}",
    )
except Exception:
    pass  # ไม่ให้ activity log พัง main flow
```

- [ ] **Step 3: เพิ่ม GET /api/agent/activity ใน agent.py**

เปิด `backend/app/routers/agent.py` เพิ่ม endpoint ต่อท้ายไฟล์ (ก่อน delete endpoint):

```python
@router.get("/activity")
async def get_activity(current: dict = Depends(get_current_user)):
    """Return 20 most recent activity records across all agents."""
    if current.get("role") not in IT_ROLES:
        raise HTTPException(403, "IT manager only")
    db = get_db()
    docs = await db.agent_activity.find({}).sort("timestamp", -1).limit(20).to_list(None)
    result = []
    for d in docs:
        d.pop("_id", None)
        d["timestamp"] = d["timestamp"].isoformat() if hasattr(d.get("timestamp"), "isoformat") else str(d.get("timestamp", ""))
        result.append(d)
    return {"activities": result}
```

- [ ] **Step 4: เพิ่ม activityApi ใน frontend/lib/api.ts**

เปิด `frontend/lib/api.ts` เพิ่มต่อท้าย skillApi:

```typescript
// ─── Agent Activity ──────────────────────────────────────────
export const activityApi = {
  list: () => request<{ activities: Array<{
    agent_id: string
    agent_name: string
    agent_avatar: string
    message: string
    timestamp: string
  }> }>('GET', '/api/agent/activity'),
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/agent_service.py backend/app/routers/agent.py frontend/lib/api.ts
git commit -m "feat(ai-manager): add activity logging and GET /api/agent/activity endpoint"
```

---

### Task 3: ลบหน้าเดิม + อัปเดต Sidebar

**Files:**
- Delete: `frontend/app/(app)/ai-manager/skills/page.tsx`
- Delete: `frontend/app/(app)/chat/agent-settings/page.tsx`
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: ลบไฟล์เดิม**

```bash
rm "frontend/app/(app)/ai-manager/skills/page.tsx"
rm "frontend/app/(app)/chat/agent-settings/page.tsx"
```

- [ ] **Step 2: ลบ agent-settings folder ถ้าว่าง**

```bash
rmdir "frontend/app/(app)/chat/agent-settings" 2>/dev/null || true
rmdir "frontend/app/(app)/ai-manager/skills" 2>/dev/null || true
```

- [ ] **Step 3: ตรวจสอบ Sidebar ว่ามีลิงก์ไปหน้าที่ลบไหม**

```bash
grep -n "agent-settings\|ai-manager/skills" frontend/components/layout/Sidebar.tsx
```

ถ้ามี ลบ/แก้บรรทัดนั้นออก

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ai-manager): remove old agent-settings and skills pages"
```

---

### Task 4: สร้าง OrgChart component (Left Panel)

**Files:**
- Create: `frontend/app/(app)/ai-manager/_components/OrgChart.tsx`

- [ ] **Step 1: สร้างไฟล์**

```bash
mkdir -p "frontend/app/(app)/ai-manager/_components"
```

- [ ] **Step 2: สร้าง OrgChart.tsx**

```tsx
// frontend/app/(app)/ai-manager/_components/OrgChart.tsx
'use client'

interface Agent {
  id: string
  name: string
  avatar: string
  is_manager?: boolean
}

interface OrgChartProps {
  agents: Agent[]
  selectedId: string | null
  onSelect: (agent: Agent) => void
  onCreateClick: () => void
}

export default function OrgChart({ agents, selectedId, onSelect, onCreateClick }: OrgChartProps) {
  const manager = agents.find(a => a.is_manager)
  const children = agents.filter(a => !a.is_manager)

  return (
    <div className="flex flex-col items-center gap-0 pt-6 pb-4 px-4 overflow-y-auto h-full">
      {/* Manager Node */}
      {manager && (
        <div
          onClick={() => onSelect(manager)}
          className={`w-56 bg-white border-2 rounded-[14px] p-4 flex flex-col items-center gap-2 cursor-pointer transition-all shadow-[0_4px_12px_rgba(0,74,198,0.1)]
            ${selectedId === manager.id ? 'border-ai-primary' : 'border-ai-border hover:border-ai-primary'}`}
        >
          <span className="text-3xl">{manager.avatar}</span>
          <span className="text-sm font-semibold text-ai-text">{manager.name}</span>
          <span className="text-[10px] font-bold bg-ai-badge-bg text-ai-badge-text px-2 py-0.5 rounded-full">MANAGER</span>
        </div>
      )}

      {/* Connector line */}
      {children.length > 0 && (
        <div className="w-px h-8 bg-ai-border" />
      )}

      {/* Children Nodes */}
      <div className="flex flex-col gap-3 w-full items-center">
        {children.map(agent => (
          <div
            key={agent.id}
            onClick={() => onSelect(agent)}
            className={`w-56 bg-white border-2 rounded-[14px] p-3 flex items-center justify-between cursor-pointer transition-all
              ${selectedId === agent.id
                ? 'border-ai-primary'
                : 'border-ai-border hover:border-ai-primary opacity-80 hover:opacity-100'
              }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{agent.avatar}</span>
              <span className="text-sm font-semibold text-ai-text">{agent.name}</span>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-ai-idle" title="ว่าง" />
          </div>
        ))}

        {/* Add Agent Button */}
        <button
          onClick={onCreateClick}
          className="w-56 border-2 border-dashed border-ai-border rounded-[14px] p-3 text-ai-text-muted text-sm flex items-center justify-center gap-2 hover:border-ai-primary hover:text-ai-primary transition-all"
        >
          <span>+</span> เพิ่ม Agent
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(app)/ai-manager/_components/OrgChart.tsx"
git commit -m "feat(ai-manager): add OrgChart component for left panel"
```

---

### Task 5: สร้าง SettingsPanel component (Right Panel)

**Files:**
- Create: `frontend/app/(app)/ai-manager/_components/SettingsPanel.tsx`

**Context:** SettingsPanel รับ agent object + skills list แสดงฟอร์ม 3 section: Identity, Model Config, Capabilities ทำ save โดยเรียก `agentApi.updateConfig()` ด้วย full config

- [ ] **Step 1: สร้าง SettingsPanel.tsx**

```tsx
// frontend/app/(app)/ai-manager/_components/SettingsPanel.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add "frontend/app/(app)/ai-manager/_components/SettingsPanel.tsx"
git commit -m "feat(ai-manager): add SettingsPanel component for right panel"
```

---

### Task 6: สร้าง CreateAgentModal component

**Files:**
- Create: `frontend/app/(app)/ai-manager/_components/CreateAgentModal.tsx`

- [ ] **Step 1: สร้าง CreateAgentModal.tsx**

```tsx
// frontend/app/(app)/ai-manager/_components/CreateAgentModal.tsx
'use client'
import { useState } from 'react'
import { agentApi } from '@/lib/api'

interface CreateAgentModalProps {
  onClose: () => void
  onCreated: () => void
}

export default function CreateAgentModal({ onClose, onCreated }: CreateAgentModalProps) {
  const [form, setForm] = useState({
    id: '', name: '', avatar: '🤖',
    provider: 'openrouter', model: 'openai/gpt-4o-mini',
    api_key: '', personality: 'friendly',
  })
  const [creating, setCreating] = useState(false)

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleCreate() {
    if (!form.id || !form.name) return alert('กรุณาใส่ ID และชื่อ')
    setCreating(true)
    try {
      await agentApi.createAgent(form)
      onCreated()
      onClose()
    } catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-[14px] p-6 w-[480px] shadow-xl">
        <h3 className="text-base font-bold text-ai-text mb-4">สร้าง Agent ใหม่</h3>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">ID (unique)</label>
              <input value={form.id} onChange={e => set('id', e.target.value)}
                placeholder="sales_agent_1"
                className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm focus:outline-none focus:border-ai-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">ชื่อ</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Sales AI"
                className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm focus:outline-none focus:border-ai-primary" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">Avatar</label>
              <input value={form.avatar} onChange={e => set('avatar', e.target.value)}
                className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm focus:outline-none focus:border-ai-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">Provider</label>
              <select value={form.provider} onChange={e => set('provider', e.target.value)}
                className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm bg-white focus:outline-none focus:border-ai-primary">
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">Personality</label>
              <select value={form.personality} onChange={e => set('personality', e.target.value)}
                className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm bg-white focus:outline-none focus:border-ai-primary">
                <option value="friendly">😊 Friendly</option>
                <option value="formal">🎩 Formal</option>
                <option value="concise">⚡ Concise</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ai-text-muted mb-1">Model</label>
            <input value={form.model} onChange={e => set('model', e.target.value)}
              className="w-full border border-ai-border rounded-[14px] py-2 px-3 text-sm font-mono focus:outline-none focus:border-ai-primary" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleCreate} disabled={creating}
            className="flex-1 py-2 bg-ai-primary text-white rounded-[14px] text-sm font-bold hover:bg-ai-primary-hover disabled:opacity-50">
            {creating ? 'กำลังสร้าง...' : 'สร้าง Agent'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 bg-gray-100 text-ai-text rounded-[14px] text-sm font-bold hover:bg-gray-200">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "frontend/app/(app)/ai-manager/_components/CreateAgentModal.tsx"
git commit -m "feat(ai-manager): add CreateAgentModal component"
```

---

### Task 7: สร้าง ActivityFeed component

**Files:**
- Create: `frontend/app/(app)/ai-manager/_components/ActivityFeed.tsx`

- [ ] **Step 1: สร้าง ActivityFeed.tsx**

```tsx
// frontend/app/(app)/ai-manager/_components/ActivityFeed.tsx
'use client'
import { useState, useEffect } from 'react'
import { activityApi } from '@/lib/api'

interface Activity {
  agent_id: string
  agent_name: string
  agent_avatar: string
  message: string
  timestamp: string
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([])

  async function load() {
    try {
      const r = await activityApi.list() as any
      setActivities(r.activities || [])
    } catch {}
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  const mockItems: Activity[] = activities.length > 0 ? activities : [
    { agent_id: 'ai_manager', agent_name: 'AI Manager', agent_avatar: '🧠', message: 'ระบบพร้อมใช้งาน', timestamp: new Date().toISOString() },
  ]

  function formatTime(ts: string) {
    try {
      return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="h-12 bg-white border-t border-ai-border flex items-center px-4 shrink-0 overflow-hidden">
      <div className="flex items-center gap-2 mr-4 shrink-0">
        <span className="w-2 h-2 rounded-full bg-ai-active animate-pulse" />
        <span className="text-xs font-semibold text-ai-active whitespace-nowrap">Live Activity</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex gap-8 animate-marquee whitespace-nowrap">
          {[...mockItems, ...mockItems].map((a, i) => (
            <span key={i} className="text-xs text-ai-text-muted flex items-center gap-1.5">
              <span>{a.agent_avatar}</span>
              <span className="font-medium text-ai-text">{a.agent_name}</span>
              <span className="text-ai-text-muted">[{formatTime(a.timestamp)}]</span>
              <span>{a.message}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "frontend/app/(app)/ai-manager/_components/ActivityFeed.tsx"
git commit -m "feat(ai-manager): add ActivityFeed component with 10s polling"
```

---

### Task 8: สร้าง Main Page — wire everything together

**Files:**
- Modify (rebuild): `frontend/app/(app)/ai-manager/page.tsx`

- [ ] **Step 1: เขียน main page ใหม่ทั้งหมด**

```tsx
// frontend/app/(app)/ai-manager/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { agentApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import OrgChart from './_components/OrgChart'
import SettingsPanel from './_components/SettingsPanel'
import CreateAgentModal from './_components/CreateAgentModal'
import ActivityFeed from './_components/ActivityFeed'

const ALLOWED_ROLES = ['admin', 'it_manager', 'super_admin']

interface Agent {
  id: string
  name: string
  avatar: string
  is_manager?: boolean
}

export default function AiManagerPage() {
  const session = getSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session && !ALLOWED_ROLES.includes(session.role)) router.push('/chat')
  }, [session, router])

  async function loadAgents() {
    setLoading(true)
    try {
      const r = await agentApi.listAgents() as any
      setAgents(r.agents || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadAgents() }, [])

  async function handleChatCommand(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim()) return
    setChatSending(true)
    try {
      await agentApi.chat('ai_manager', chatInput)
      setChatInput('')
      await loadAgents()
    } catch {}
    setChatSending(false)
  }

  async function handleDelete(agentId: string) {
    try {
      await agentApi.deleteAgent(agentId)
      setSelectedAgent(null)
      await loadAgents()
    } catch (e: any) { alert(e.message || 'ลบไม่ได้') }
  }

  if (session && !ALLOWED_ROLES.includes(session.role)) return null

  return (
    <div className="flex flex-col h-full overflow-hidden bg-ai-surface">
      {/* Header */}
      <header className="bg-white border-b border-ai-border h-16 flex items-center gap-4 px-6 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <h1 className="text-lg font-bold text-ai-primary">AI Manager Dashboard</h1>
        </div>

        {/* Chat command input */}
        <form onSubmit={handleChatCommand} className="flex-1 max-w-2xl flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="สั่ง AI Manager: 'สร้าง AI สำหรับทีมขาย...'"
              className="w-full border border-ai-border rounded-[14px] py-2 pl-4 pr-10 text-sm text-ai-text focus:outline-none focus:border-ai-primary bg-white"
            />
            <button type="submit" disabled={chatSending}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ai-primary hover:text-ai-primary-hover disabled:opacity-40">
              {chatSending ? '...' : '➤'}
            </button>
          </div>
        </form>

        <button
          onClick={() => setShowCreate(true)}
          className="bg-ai-primary text-white text-sm font-bold px-4 py-2 rounded-[14px] hover:bg-ai-primary-hover transition-colors flex items-center gap-1 shrink-0"
        >
          + สร้าง Agent
        </button>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Org Chart */}
        <div className="w-[40%] border-r border-ai-border overflow-hidden bg-ai-surface">
          {loading ? (
            <div className="flex items-center justify-center h-full text-ai-text-muted text-sm">กำลังโหลด...</div>
          ) : (
            <OrgChart
              agents={agents}
              selectedId={selectedAgent?.id || null}
              onSelect={setSelectedAgent}
              onCreateClick={() => setShowCreate(true)}
            />
          )}
        </div>

        {/* Right Panel - Settings */}
        <div className="w-[60%] flex flex-col overflow-hidden bg-white">
          <SettingsPanel
            agent={selectedAgent}
            onDelete={handleDelete}
            onSaved={loadAgents}
          />
        </div>
      </div>

      {/* Bottom - Activity Feed */}
      <ActivityFeed />

      {/* Create Agent Modal */}
      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreated={loadAgents}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: ตรวจสอบว่า build ผ่าน**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error|✓" | head -20
```

Expected: ✓ Compiled successfully (ไม่มี error)

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(app)/ai-manager/page.tsx"
git commit -m "feat(ai-manager): rebuild main page as Hub & Spoke dashboard"
```

---

### Task 9: Deploy + ตรวจสอบ

- [ ] **Step 1: Push และ deploy**

```bash
git push
ssh -i C:/Users/hot/.ssh/planeat-vps root@76.13.211.161 "cd ~/planeat-app && git pull && docker compose build --no-cache frontend backend && docker compose up -d"
```

- [ ] **Step 2: ตรวจสอบหน้า /ai-manager**
  - เข้า `/ai-manager` ด้วย admin/it_manager account
  - เห็น org chart ซ้าย แสดง AI Manager + agent ลูกน้อง
  - คลิก agent แล้วเห็น settings panel ขวา
  - กรอก API Key แล้วกด บันทึก — ไม่มี error
  - Activity feed เลื่อนที่ด้านล่าง
  - ปุ่ม "+ สร้าง Agent" เปิด modal

- [ ] **Step 3: ตรวจสอบว่าหน้าเดิมถูกลบแล้ว**
  - `/ai-manager/skills` → 404 ✓
  - `/chat/agent-settings` → 404 ✓
