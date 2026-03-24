'use client'
import { useEffect, useRef, useCallback } from 'react'
import type { Chart as ChartType } from 'chart.js'

interface TrendChartProps {
  labels: string[]
  data: number[]
  color?: string
  label?: string
  onDayClick?: (dayLabel: string) => void
}

export default function TrendChart({ labels, data, color = '#6366f1', label = 'ยอดรวม', onDayClick }: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartType | null>(null)
  const onDayClickRef = useRef(onDayClick)
  onDayClickRef.current = onDayClick

  useEffect(() => {
    let mounted = true

    async function init() {
      const {
        Chart: C,
        BarElement,
        BarController,
        CategoryScale,
        LinearScale,
        Tooltip,
        Legend,
      } = await import('chart.js')
      C.register(BarElement, BarController, CategoryScale, LinearScale, Tooltip, Legend)

      if (!canvasRef.current || !mounted) return
      if (chartRef.current) chartRef.current.destroy()

      chartRef.current = new C(canvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label,
            data,
            backgroundColor: color + 'cc',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 4,
            hoverBackgroundColor: color,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 1200, easing: 'easeOutQuart' } as never,
          onClick: (_e, elements) => {
            if (elements.length > 0) {
              const idx = elements[0].index
              const dayLabel = labels[idx]
              onDayClickRef.current?.(dayLabel)
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `วันที่ ${ctx.label}: ${Number(ctx.raw).toLocaleString('th-TH')} ฿`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 }, color: '#94a3b8' },
            },
            y: {
              grid: { color: '#f1f5f9' },
              ticks: {
                font: { size: 11 },
                color: '#94a3b8',
                callback: (v) => {
                  const n = Number(v)
                  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n
                },
              },
              border: { display: false },
            },
          },
        },
      })
    }

    init()
    return () => {
      mounted = false
      chartRef.current?.destroy()
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.data.labels = labels
    chartRef.current.data.datasets[0].data = data
    chartRef.current.data.datasets[0].label = label
    ;(chartRef.current.data.datasets[0] as never as { backgroundColor: string }).backgroundColor = color + 'cc'
    ;(chartRef.current.data.datasets[0] as never as { borderColor: string }).borderColor = color
    chartRef.current.update()
  }, [labels, data, color, label])

  return <canvas ref={canvasRef} style={{ height: '100%', width: '100%' }} />
}
