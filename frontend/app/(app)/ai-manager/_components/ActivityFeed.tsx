'use client'
import { useState, useEffect } from 'react'
import { agentActivityApi } from '@/lib/api'

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
      const r = await agentActivityApi.list() as any
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
              <span className="material-icons-round text-ai-text-muted" style={{ fontSize: 14 }}>smart_toy</span>
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
