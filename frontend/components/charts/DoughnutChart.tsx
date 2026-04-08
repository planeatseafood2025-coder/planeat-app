'use client'
import { useEffect, useRef } from 'react'
import type { Chart as ChartType } from 'chart.js'

interface DoughnutChartProps {
  labels: string[]
  data: number[]
  colors: string[]
  centerText?: string
  centerSubText?: string
  onSliceClick?: (index: number) => void
}

export default function DoughnutChart({ labels, data, colors, centerText, centerSubText, onSliceClick }: DoughnutChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartType | null>(null)
  const onSliceClickRef = useRef(onSliceClick)
  onSliceClickRef.current = onSliceClick

  useEffect(() => {
    let Chart: typeof import('chart.js').Chart
    let mounted = true

    async function init() {
      const { Chart: C, ArcElement, DoughnutController, Tooltip, Legend } = await import('chart.js')
      C.register(ArcElement, DoughnutController, Tooltip, Legend)
      Chart = C

      if (!canvasRef.current || !mounted) return

      // Custom center text plugin
      const centerTextPlugin = {
        id: 'centerText',
        afterDraw(chart: ChartType) {
          const { ctx, chartArea } = chart
          if (!centerText) return
          const cx = (chartArea.left + chartArea.right) / 2
          const cy = (chartArea.top + chartArea.bottom) / 2
          ctx.save()
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#1e293b'
          ctx.font = 'bold 16px IBM Plex Sans Thai, Prompt, sans-serif'
          ctx.fillText(centerText, cx, cy - (centerSubText ? 10 : 0))
          if (centerSubText) {
            ctx.font = '12px IBM Plex Sans Thai, Prompt, sans-serif'
            ctx.fillStyle = '#64748b'
            ctx.fillText(centerSubText, cx, cy + 12)
          }
          ctx.restore()
        },
      }

      if (chartRef.current) chartRef.current.destroy()

      chartRef.current = new Chart(canvasRef.current, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#fff',
            hoverBorderColor: '#fff',
            hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '72%',
          animation: { duration: 1200, easing: 'easeOutQuart' } as never,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${Number(ctx.raw).toLocaleString('th-TH')} ฿`,
              },
            },
          },
          onClick: (_event, elements) => {
            if (elements.length > 0 && onSliceClickRef.current) {
              onSliceClickRef.current(elements[0].index)
            }
          },
        },
        plugins: [centerTextPlugin as never],
      })
    }

    init()
    return () => {
      mounted = false
      chartRef.current?.destroy()
    }
  }, []) // init once

  // Update data when props change
  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.data.labels = labels
    chartRef.current.data.datasets[0].data = data
    chartRef.current.data.datasets[0].backgroundColor = colors
    chartRef.current.update()
  }, [labels, data, colors])

  return (
    <div className="relative" style={{ maxWidth: 260, margin: '0 auto' }}>
      <canvas ref={canvasRef} style={{ cursor: onSliceClick ? 'pointer' : 'default' }} />
    </div>
  )
}
