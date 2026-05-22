'use client'
import { useState, useEffect } from 'react'
import { agentApi, skillApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { useRouter } from 'next/navigation'

const IT_ROLES = ['admin', 'it_manager', 'super_admin']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter']
const PERSONALITIES = ['friendly', 'formal', 'concise']

export default function AiManagerPage() {
  const session = getSession()
  const router = useRouter()

  useEffect(() => {
    if (session && !IT_ROLES.includes(session.role)) router.push('/chat')
  }, [session, router])

  const [agents, setAgents] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newAgent, setNewAgent] = useState({
    id: '', name: '', avatar: '🤖', provider: 'openrouter',
    model: 'openai/gpt-4o-mini', personality: 'friendly',
  })
  const [creating, setCreating] = useState(false)
  const [assigningSkills, setAssigningSkills] = useState<string | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  async function loadData() {
    setLoading(true)
    try {
      const [agRes, skRes] = await Promise.all([agentApi.listAgents(), skillApi.list()])
      setAgents((agRes as any).agents || [])
      setSkills((skRes as any).skills || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function handleCreate() {
    if (!newAgent.id || !newAgent.name) return alert('กรุณาใส่ id และชื่อ')
    setCreating(true)
    try {
      await agentApi.createAgent(newAgent)
      setShowCreate(false)
      setNewAgent({ id: '', name: '', avatar: '🤖', provider: 'openrouter', model: 'openai/gpt-4o-mini', personality: 'friendly' })
      await loadData()
    } catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
    setCreating(false)
  }

  async function handleDelete(agentId: string, agentName: string) {
    if (!confirm(`ลบ agent "${agentName}" ใช่ไหม?`)) return
    try {
      await agentApi.deleteAgent(agentId)
      await loadData()
    } catch (e: any) { alert(e.message || 'ลบไม่ได้') }
  }

  function openAssignSkills(agent: any) {
    setAssigningSkills(agent.id)
    setSelectedSkills(agent.skill_ids || [])
  }

  async function handleSaveSkills() {
    if (!assigningSkills) return
    try {
      await agentApi.updateConfig(assigningSkills, { skill_ids: selectedSkills })
      setAssigningSkills(null)
      await loadData()
    } catch (e: any) { alert(e.message || 'บันทึกไม่ได้') }
  }

  if (session && !IT_ROLES.includes(session.role)) return null

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 900 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>🧠 AI Manager Dashboard</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>จัดการ AI agents และ skills ทั้งหมด</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/ai-manager/skills" style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
              ⚡ จัดการ Skills
            </a>
            <button onClick={() => setShowCreate(true)} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + สร้าง Agent ใหม่
            </button>
          </div>
        </div>

        {/* Create Agent Form */}
        {showCreate && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>สร้าง Agent ใหม่</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ID (unique)</label>
                <input value={newAgent.id} onChange={e => setNewAgent(a => ({ ...a, id: e.target.value }))} placeholder="sales_agent_1" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อ</label>
                <input value={newAgent.name} onChange={e => setNewAgent(a => ({ ...a, name: e.target.value }))} placeholder="Sales AI" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Avatar</label>
                <input value={newAgent.avatar} onChange={e => setNewAgent(a => ({ ...a, avatar: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Provider</label>
                <select value={newAgent.provider} onChange={e => setNewAgent(a => ({ ...a, provider: e.target.value }))} style={inputStyle}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Model</label>
                <input value={newAgent.model} onChange={e => setNewAgent(a => ({ ...a, model: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บุคลิก</label>
                <select value={newAgent.personality} onChange={e => setNewAgent(a => ({ ...a, personality: e.target.value }))} style={inputStyle}>
                  {PERSONALITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreate} disabled={creating} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                {creating ? 'กำลังสร้าง...' : 'สร้าง Agent'}
              </button>
              <button onClick={() => setShowCreate(false)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Assign Skills Modal */}
        {assigningSkills && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Assign Skills — {agents.find(a => a.id === assigningSkills)?.name}</h3>
              {skills.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 13 }}>ยังไม่มี skills — <a href="/ai-manager/skills">สร้าง skill ก่อน</a></p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {skills.map(s => (
                    <label key={s.skill_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: selectedSkills.includes(s.skill_id) ? '#eff6ff' : '#fff' }}>
                      <input type="checkbox" checked={selectedSkills.includes(s.skill_id)} onChange={() => {
                        setSelectedSkills(prev => prev.includes(s.skill_id) ? prev.filter(x => x !== s.skill_id) : [...prev, s.skill_id])
                      }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{s.description}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Tools: {(s.allowed_tools || []).join(', ') || 'ไม่มี'}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleSaveSkills} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>บันทึก</button>
                <button onClick={() => setAssigningSkills(null)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* Agent List */}
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>กำลังโหลด...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agents.map(agent => (
              <div key={agent.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ fontSize: 32 }}>{agent.avatar || '🤖'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{agent.name}</span>
                    {agent.is_manager && <span style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>MANAGER</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {agent.id} · {agent.provider}/{agent.model}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Skills: {(agent.skill_ids || []).length > 0 ? agent.skill_ids.join(', ') : 'ไม่มี'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openAssignSkills(agent)} style={{ padding: '6px 12px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ⚡ Skills
                  </button>
                  <a href={`/chat/agent-settings`} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                    ⚙️ ตั้งค่า
                  </a>
                  {!agent.is_manager && (
                    <button onClick={() => handleDelete(agent.id, agent.name)} style={{ padding: '6px 12px', background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      🗑️ ลบ
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
