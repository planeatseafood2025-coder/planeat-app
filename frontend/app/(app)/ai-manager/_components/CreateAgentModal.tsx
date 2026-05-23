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
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-ai-primary" style={{ fontSize: 20 }}>add_circle_outline</span>
          <h3 className="text-base font-bold text-ai-text">สร้าง Agent ใหม่</h3>
        </div>

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
          <div className="grid grid-cols-2 gap-3">
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
              <label className="block text-xs font-semibold text-ai-text-muted mb-1">บุคลิก</label>
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
