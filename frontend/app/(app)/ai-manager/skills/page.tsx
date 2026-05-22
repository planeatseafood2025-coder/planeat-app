'use client'
import { useState, useEffect } from 'react'
import { skillApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { useRouter } from 'next/navigation'

const IT_ROLES = ['admin', 'it_manager', 'super_admin']

const ALL_TOOLS = [
  'getDeals', 'getAccounts', 'getContacts', 'getActivities', 'getReminders',
  'createReminder', 'logActivity', 'createContact', 'sendPreviewEmail', 'sendEmail',
  'listAgents', 'createAgent', 'updateAgentSkills', 'listSkills', 'deleteAgent',
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const EMPTY_SKILL = { skill_id: '', name: '', description: '', prompt_snippet: '', allowed_tools: [] as string[] }

export default function SkillsPage() {
  const session = getSession()
  const router = useRouter()

  useEffect(() => {
    if (session && !IT_ROLES.includes(session.role)) router.push('/chat')
  }, [session, router])

  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  async function loadSkills() {
    setLoading(true)
    try {
      const res = await skillApi.list() as any
      setSkills(res.skills || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadSkills() }, [])

  async function handleSave() {
    if (!editing.skill_id || !editing.name) return alert('กรุณาใส่ skill_id และชื่อ')
    setSaving(true)
    try {
      await skillApi.upsert(editing.skill_id, editing)
      setEditing(null)
      await loadSkills()
    } catch (e: any) { alert(e.message || 'บันทึกไม่ได้') }
    setSaving(false)
  }

  async function handleDelete(skillId: string, skillName: string) {
    if (!confirm(`ลบ skill "${skillName}" ใช่ไหม?`)) return
    try {
      await skillApi.delete(skillId)
      await loadSkills()
    } catch (e: any) { alert(e.message || 'ลบไม่ได้') }
  }

  function toggleTool(tool: string) {
    setEditing((s: any) => ({
      ...s,
      allowed_tools: s.allowed_tools.includes(tool)
        ? s.allowed_tools.filter((t: string) => t !== tool)
        : [...s.allowed_tools, tool],
    }))
  }

  if (session && !IT_ROLES.includes(session.role)) return null

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ marginBottom: 4 }}>
              <a href="/ai-manager" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>← AI Manager</a>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>⚡ จัดการ Skills</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Skills คือชุดความสามารถที่ assign ให้ agent ได้</p>
          </div>
          <button onClick={() => setEditing({ ...EMPTY_SKILL })} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + สร้าง Skill ใหม่
          </button>
        </div>

        {/* Edit Form */}
        {editing && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{editing.skill_id ? `แก้ไข: ${editing.name}` : 'สร้าง Skill ใหม่'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Skill ID (unique)</label>
                <input value={editing.skill_id} onChange={e => setEditing((s: any) => ({ ...s, skill_id: e.target.value }))} placeholder="crm_sales_expert" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อ Skill</label>
                <input value={editing.name} onChange={e => setEditing((s: any) => ({ ...s, name: e.target.value }))} placeholder="CRM Sales Expert" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>คำอธิบาย</label>
              <input value={editing.description} onChange={e => setEditing((s: any) => ({ ...s, description: e.target.value }))} placeholder="วิเคราะห์ deals และบัญชีลูกค้า" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Prompt Snippet</label>
              <textarea value={editing.prompt_snippet} onChange={e => setEditing((s: any) => ({ ...s, prompt_snippet: e.target.value }))}
                placeholder="คุณเชี่ยวชาญด้านการวิเคราะห์ข้อมูล CRM B2B..."
                style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>Tools ที่ skill นี้อนุญาต</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_TOOLS.map(tool => (
                  <button key={tool} onClick={() => toggleTool(tool)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid', borderColor: editing.allowed_tools.includes(tool) ? '#2563eb' : '#e2e8f0', background: editing.allowed_tools.includes(tool) ? '#eff6ff' : '#fff', color: editing.allowed_tools.includes(tool) ? '#1d4ed8' : '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    {editing.allowed_tools.includes(tool) ? '✓ ' : ''}{tool}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก Skill'}
              </button>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>ยกเลิก</button>
            </div>
          </div>
        )}

        {/* Skills List */}
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>กำลังโหลด...</div>
        ) : skills.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            ยังไม่มี skills กด "สร้าง Skill ใหม่" เพื่อเริ่มต้น
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {skills.map(skill => (
              <div key={skill.skill_id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{skill.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{skill.skill_id} · {skill.description}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Tools: {(skill.allowed_tools || []).length > 0 ? skill.allowed_tools.join(', ') : 'ไม่มี'}
                  </div>
                  {skill.prompt_snippet && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📝 {skill.prompt_snippet}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditing({ ...skill })} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    แก้ไข
                  </button>
                  <button onClick={() => handleDelete(skill.skill_id, skill.name)} style={{ padding: '6px 12px', background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
