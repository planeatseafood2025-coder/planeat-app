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
