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
          <span className="material-icons-round text-ai-primary" style={{ fontSize: 32 }}>psychology</span>
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
              <span className="material-icons-round text-ai-text-muted" style={{ fontSize: 24 }}>smart_toy</span>
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
