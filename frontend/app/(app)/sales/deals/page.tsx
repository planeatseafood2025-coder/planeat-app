'use client'

import React, { useState, useEffect } from 'react'
import { salesApi } from '@/lib/api'
import { Deal, DealStage } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import Swal from 'sweetalert2'

const STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost']
const STAGE_LABELS: Record<DealStage, string> = {
  lead: 'Lead ใหม่',
  qualified: 'คัดกรองแล้ว',
  proposal: 'เสนอราคา',
  negotiation: 'เจรจาต่อรอง',
  won: 'ปิดการขาย (Won)',
  lost: 'ไม่สำเร็จ (Lost)'
}
const STAGE_COLORS: Record<DealStage, string> = {
  lead: '#3b82f6',
  qualified: '#8b5cf6',
  proposal: '#f59e0b',
  negotiation: '#f97316',
  won: '#10b981',
  lost: '#ef4444'
}

export default function DealsPage() {
  const { user } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  // Drag state
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null)

  useEffect(() => {
    fetchDeals()
  }, [])

  async function fetchDeals() {
    setLoading(true)
    try {
      // Get all deals for simplicity in phase 1 
      const res = await salesApi.getDeals({ perPage: 200 })
      if (res.success) {
        setDeals(res.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Handle Drag Events
  function handleDragStart(e: React.DragEvent, dealId: string) {
    setDraggedDealId(dealId)
    e.dataTransfer.effectAllowed = 'move'
    // For visual ghost
    setTimeout(() => {
      const el = document.getElementById(`deal-${dealId}`)
      if (el) el.style.opacity = '0.5'
    }, 0)
  }

  function handleDragEnd(e: React.DragEvent, dealId: string) {
    setDraggedDealId(null)
    const el = document.getElementById(`deal-${dealId}`)
    if (el) el.style.opacity = '1'
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault() // Required to allow dropping
    e.dataTransfer.dropEffect = 'move'
  }

  async function handleDrop(e: React.DragEvent, targetStage: DealStage) {
    e.preventDefault()
    if (!draggedDealId) return

    const deal = deals.find(d => d.id === draggedDealId)
    if (!deal || deal.stage === targetStage) return

    // Optimistic UI Update
    setDeals(prev => prev.map(d => d.id === draggedDealId ? { ...d, stage: targetStage } : d))

    try {
      await salesApi.updateDeal(draggedDealId, { stage: targetStage })
    } catch (err) {
      console.error('Failed to update stage', err)
      // Revert if error
      fetchDeals()
      Swal.fire('Error', 'ไม่สามารถเปลี่ยนสถานะได้', 'error')
    }
  }

  return (
    <div className="p-4 h-[calc(100vh-64px)] overflow-hidden flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sales Pipeline</h1>
          <p className="text-sm text-slate-500">กระดานติดตามงานขายแบบ Kanban</p>
        </div>
        <button onClick={() => {
            Swal.fire({ title: 'สร้างจำลองข้อมูลชั่วคราว', text: 'ไปสร้างลูกค้าและเพิ่มที่หน้าลูกค้านะครับ' })
        }} className="btn-primary">
          <span className="material-icons-round text-sm mr-1">add</span> เพิ่มดีล
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <span className="material-icons-round spin text-4xl text-blue-500">refresh</span>
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const stageDeals = deals.filter(d => d.stage === stage)
            const color = STAGE_COLORS[stage]

            return (
              <div
                key={stage}
                className="flex-shrink-0 w-80 bg-white shadow-sm rounded-xl flex flex-col border border-slate-200"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage)}
              >
                {/* Column Header */}
                <div 
                  className="p-3 border-b-2 rounded-t-xl"
                  style={{ borderBottomColor: color, backgroundColor: `${color}10` }}
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-700" style={{ color }}>{STAGE_LABELS[stage]}</h3>
                    <span className="text-xs font-semibold bg-white text-slate-500 px-2 py-0.5 rounded-full shadow-sm">
                      {stageDeals.length}
                    </span>
                  </div>
                </div>

                {/* Column Body - Droppable Area */}
                <div className="flex-1 p-2 overflow-y-auto space-y-3 min-h-[150px]">
                  {stageDeals.map(deal => (
                    <div
                      key={deal.id}
                      id={`deal-${deal.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      onDragEnd={(e) => handleDragEnd(e, deal.id)}
                      className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300 transition-colors"
                    >
                      <div className="font-bold text-sm text-slate-800 mb-1 leading-tight">{deal.title}</div>
                      <div className="text-xs text-slate-500 mb-2">มูลค่า: ฿{deal.value?.toLocaleString('th-TH') || '0'}</div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                          {deal.probability}%
                        </span>
                        {deal.expectedCloseDate && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span className="material-icons-round" style={{ fontSize: 10 }}>event</span>
                            {deal.expectedCloseDate}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {stageDeals.length === 0 && (
                     <div className="h-full flex items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
                        {/* Empty placeholder to ensure droppable space */}
                        ลากดีลมาวางที่นี่
                     </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
