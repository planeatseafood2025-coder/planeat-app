'use client'

import React, { useState, useEffect } from 'react'
import { activityApi } from '@/lib/api'
import { CustomerActivity, ActivityType } from '@/types'

const ACTIVITY_ICONS: Record<ActivityType, { icon: string; color: string; bg: string }> = {
  note: { icon: 'edit_note', color: '#64748b', bg: '#f1f5f9' },
  call: { icon: 'call', color: '#0ea5e9', bg: '#e0f2fe' },
  email: { icon: 'mail', color: '#8b5cf6', bg: '#ede9fe' },
  meeting: { icon: 'event', color: '#f59e0b', bg: '#fef3c7' },
  line: { icon: 'chat', color: '#10b981', bg: '#d1fae5' },
}

interface ActivityTimelineProps {
  targetId: string
  targetType: 'customer' | 'deal'
}

export default function ActivityTimeline({ targetId, targetType }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<CustomerActivity[]>([])
  const [loading, setLoading] = useState(true)
  
  // Form State
  const [newType, setNewType] = useState<ActivityType>('note')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    fetchActivities()
  }, [targetId])

  async function fetchActivities() {
    setLoading(true)
    try {
      const res = await activityApi.getActivities({ targetId, targetType }) as any
      if (res.success) {
        setActivities(res.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddActivity() {
    if (!newDesc.trim()) return
    
    try {
      const res = await activityApi.createActivity({
        targetId,
        targetType,
        type: newType,
        description: newDesc
      })
      if (res.success) {
        setNewDesc('')
        fetchActivities()
      }
    } catch (e) {
      console.error(e)
    }
  }

  function formatDateTime(isoStr: string) {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span className="material-icons-round text-blue-500">history</span>
        ประวัติการติดต่อ / ความเคลื่อนไหว
      </h3>

      {/* Input Form */}
      <div className="mb-6 flex gap-3 items-start bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="shrink-0 pt-1">
           <select 
              value={newType} 
              onChange={e => setNewType(e.target.value as ActivityType)}
              className="text-xs p-2 rounded-lg border-slate-200"
            >
             <option value="note">บันทึกช่วยจำ</option>
             <option value="call">โทรศัพท์</option>
             <option value="email">อีเมล</option>
             <option value="meeting">นัดประชุม</option>
             <option value="line">ไลน์</option>
           </select>
        </div>
        <div className="flex-1">
          <textarea
            className="w-full form-input text-sm resize-none mb-2"
            rows={2}
            placeholder={`ระบุรายละเอียดการติดต่อ หรือคอมเมนต์...`}
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <div className="flex justify-end">
            <button 
              onClick={handleAddActivity}
              disabled={!newDesc.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 hover:bg-blue-700 transition"
            >
              บันทึก Activities
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-0 relative border-l-2 border-slate-100 ml-4 pl-6 pb-2">
        {loading ? (
          <div className="text-center py-4 text-slate-400 text-sm">กำลังโหลด...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-4 text-slate-400 text-sm">ยังไม่มีประวัติกิจกรรม</div>
        ) : (
          activities.map((act, i) => {
            const conf = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.note
            return (
              <div key={act.id} className="relative pb-6 last:pb-0">
                {/* Timeline Dot */}
                <div 
                  className="absolute -left-[37px] top-0 w-[24px] h-[24px] rounded-full flex items-center justify-center border-4 border-white shadow-sm"
                  style={{ backgroundColor: conf.bg, color: conf.color }}
                >
                  <span className="material-icons-round" style={{ fontSize: 12 }}>{conf.icon}</span>
                </div>
                
                {/* Content */}
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold text-slate-700">{act.performedBy}</span>
                    <span className="text-[10px] text-slate-400">{formatDateTime(act.datetime)}</span>
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{act.description}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
