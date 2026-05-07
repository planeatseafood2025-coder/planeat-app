'use client'
import { useEffect, useRef, useState } from 'react'
import * as topojson from 'topojson-client'
import type { Topology } from 'topojson-specification'
import type { GeoJSON } from 'geojson'

export interface GlobePin {
  _id: string
  name: string
  country?: string
  city?: string
  tier?: string
  dealsOpen?: number
  coordinates: [number, number]
}

interface Props {
  size?: number
  pins?: GlobePin[]
  autoRotate?: boolean
  onPinClick?: (pin: GlobePin) => void
}

let _land110: GeoJSON.FeatureCollection | null = null
let _land110Promise: Promise<GeoJSON.FeatureCollection> | null = null

async function getLand(): Promise<GeoJSON.FeatureCollection> {
  if (_land110) return _land110
  if (_land110Promise) return _land110Promise
  _land110Promise = (async () => {
    const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
    const topo = await res.json() as Topology
    _land110 = topojson.feature(topo, (topo.objects as any).land) as GeoJSON.FeatureCollection
    return _land110
  })()
  return _land110Promise
}

function rotatePoint([lon, lat]: [number, number], yaw: number, pitch: number): [number, number, number] {
  const λ = (lon * Math.PI) / 180 + yaw
  const φ = (lat * Math.PI) / 180
  let x = Math.cos(φ) * Math.sin(λ)
  let y = Math.sin(φ)
  let z = Math.cos(φ) * Math.cos(λ)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  return [x, y * cp - z * sp, y * sp + z * cp]
}

function slerp(a: number[], b: number[], t: number): number[] {
  const dot = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]))
  const ω = Math.acos(dot)
  if (ω < 1e-6) return [...a]
  const s = Math.sin(ω)
  return [a[0]*Math.sin((1-t)*ω)/s + b[0]*Math.sin(t*ω)/s, a[1]*Math.sin((1-t)*ω)/s + b[1]*Math.sin(t*ω)/s, a[2]*Math.sin((1-t)*ω)/s + b[2]*Math.sin(t*ω)/s]
}

function hemisphereIntersect(a: number[], b: number[]): number {
  const dot = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]))
  const ω = Math.acos(dot)
  if (ω < 1e-6) return 0.5
  const num = -a[2] * Math.sin(ω)
  const den = a[2] * Math.cos(ω) + b[2]
  let tω = Math.atan2(num, den)
  if (tω < 0) tω += Math.PI
  return Math.max(0, Math.min(1, tω / ω))
}

function clipRingFront(ring3d: number[][]): number[][][] {
  const segs: number[][][] = []
  let cur: number[][] | null = null
  for (let i = 0; i < ring3d.length - 1; i++) {
    const a = ring3d[i], b = ring3d[i + 1]
    const aF = a[2] >= 0, bF = b[2] >= 0
    if (aF && bF) {
      if (!cur) { cur = [a]; segs.push(cur) }
      cur.push(b)
    } else if (aF && !bF) {
      const m = slerp(a, b, hemisphereIntersect(a, b))
      if (!cur) { cur = [a]; segs.push(cur) }
      cur.push(m); cur = null
    } else if (!aF && bF) {
      const m = slerp(a, b, hemisphereIntersect(a, b))
      cur = [m, b]; segs.push(cur)
    } else {
      cur = null
    }
  }
  return segs
}

function drawLandStroke(ctx: CanvasRenderingContext2D, land: GeoJSON.FeatureCollection, yaw: number, pitch: number, cx: number, cy: number, R: number) {
  ctx.save()
  ctx.strokeStyle = '#bfdbfe'
  ctx.lineWidth = 0.8
  ctx.globalAlpha = 0.85
  ctx.lineJoin = 'round'
  for (const feat of land.features) {
    const geo = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
    const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates
    for (const poly of polys) {
      for (const ring of poly) {
        const ring3d = (ring as [number, number][]).map(c => rotatePoint(c, yaw, pitch))
        for (const seg of clipRingFront(ring3d)) {
          ctx.beginPath()
          seg.forEach((p, i) => { const sx = cx + p[0]*R, sy = cy - p[1]*R; i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy) })
          ctx.stroke()
        }
      }
    }
  }
  ctx.restore()
}

function drawLandFill(ctx: CanvasRenderingContext2D, land: GeoJSON.FeatureCollection, yaw: number, pitch: number, cx: number, cy: number, R: number) {
  ctx.save()
  ctx.fillStyle = '#1d4ed8'
  ctx.globalAlpha = 0.55
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()
  for (const feat of land.features) {
    const geo = feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
    const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates
    for (const poly of polys) {
      for (const ring of poly) {
        const ring3d = (ring as [number, number][]).map(c => rotatePoint(c, yaw, pitch))
        const segs = clipRingFront(ring3d)
        if (!segs.length) continue
        ctx.beginPath()
        segs.forEach((seg, s) => {
          const first = { x: cx + seg[0][0]*R, y: cy - seg[0][1]*R }
          if (s === 0) ctx.moveTo(first.x, first.y)
          else {
            const pe = segs[s-1][segs[s-1].length-1]
            const a0 = Math.atan2(-(cy - pe[1]*R - cy), cx + pe[0]*R - cx)
            const a1 = Math.atan2(-(first.y - cy), first.x - cx)
            ctx.arc(cx, cy, R, -a0, -a1, false)
          }
          for (let i = 1; i < seg.length; i++) ctx.lineTo(cx + seg[i][0]*R, cy - seg[i][1]*R)
        })
        ctx.closePath(); ctx.fill()
      }
    }
  }
  ctx.restore()
}

function drawGraticule(ctx: CanvasRenderingContext2D, yaw: number, pitch: number, cx: number, cy: number, R: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(191,219,254,0.45)'
  ctx.lineWidth = 0.5
  ctx.globalAlpha = 0.55
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = Array.from({ length: 61 }, (_, i) => rotatePoint([lon, -90 + i * 3], yaw, pitch))
    const segs = clipRingFront([...pts, pts[pts.length - 1]])
    segs.forEach(seg => { ctx.beginPath(); seg.forEach((p, i) => { const sx = cx+p[0]*R, sy = cy-p[1]*R; i===0?ctx.moveTo(sx,sy):ctx.lineTo(sx,sy) }); ctx.stroke() })
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = Array.from({ length: 121 }, (_, i) => rotatePoint([-180 + i * 3, lat], yaw, pitch))
    const segs = clipRingFront([...pts, pts[pts.length - 1]])
    segs.forEach(seg => { ctx.beginPath(); seg.forEach((p, i) => { const sx = cx+p[0]*R, sy = cy-p[1]*R; i===0?ctx.moveTo(sx,sy):ctx.lineTo(sx,sy) }); ctx.stroke() })
  }
  ctx.restore()
}

export default function GlobeMap({ size = 520, pins = [], autoRotate = true, onPinClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [land, setLand] = useState<GeoJSON.FeatureCollection | null>(null)
  const [hover, setHover] = useState<GlobePin | null>(null)
  const stateRef = useRef({ yaw: 0, pitch: -0.35, dragging: false, lastX: 0, lastY: 0, autoRotate, vy: 0.004 })

  useEffect(() => { getLand().then(setLand) }, [])
  useEffect(() => { stateRef.current.autoRotate = autoRotate }, [autoRotate])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr; canvas.height = size * dpr
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px'
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const cx = size / 2, cy = size / 2, R = size * 0.42
    let raf: number

    function frame() {
      const s = stateRef.current
      if (s.autoRotate && !s.dragging) s.yaw += s.vy
      ctx.clearRect(0, 0, size, size)

      const grad = ctx.createRadialGradient(cx, cy, R*0.95, cx, cy, R*1.18)
      grad.addColorStop(0, 'rgba(37,99,235,0.18)'); grad.addColorStop(1, 'rgba(37,99,235,0)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size)

      const ocean = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, R*0.2, cx, cy, R)
      ocean.addColorStop(0, '#1e3a8a'); ocean.addColorStop(1, '#0b1d4a')
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fillStyle = ocean; ctx.fill()

      drawGraticule(ctx, s.yaw, s.pitch, cx, cy, R)
      if (land) { drawLandFill(ctx, land, s.yaw, s.pitch, cx, cy, R); drawLandStroke(ctx, land, s.yaw, s.pitch, cx, cy, R) }

      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2)
      ctx.strokeStyle = 'rgba(191,219,254,0.55)'; ctx.lineWidth = 1.2; ctx.stroke()

      const t = performance.now() / 1000
      const projected = pins.map(pin => {
        const p = rotatePoint(pin.coordinates, s.yaw, s.pitch)
        return { pin, px: cx + p[0]*R, py: cy - p[1]*R, z: p[2] }
      })

      projected.filter(p => p.z <= 0).forEach(p => {
        ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#bfdbfe'
        ctx.beginPath(); ctx.arc(p.px, p.py, 2.2, 0, Math.PI*2); ctx.fill(); ctx.restore()
      })

      projected.filter(p => p.z > 0).forEach(p => {
        const isHover = hover?._id === p.pin._id
        const color = p.pin.tier === 'A' ? '#fbbf24' : p.pin.tier === 'B' ? '#60a5fa' : '#a3a3a3'
        const pulse = (Math.sin(t * 2 + p.pin._id.length) + 1) / 2
        ctx.save()
        ctx.beginPath(); ctx.arc(p.px, p.py, 4 + pulse * 6, 0, Math.PI*2)
        ctx.fillStyle = color; ctx.globalAlpha = 0.25 - pulse * 0.18; ctx.fill(); ctx.restore()
        ctx.save()
        ctx.beginPath(); ctx.arc(p.px, p.py, isHover ? 7 : 5, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill()
        ctx.beginPath(); ctx.arc(p.px, p.py, isHover ? 5 : 3.5, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill()
        ctx.restore()
      })

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [land, size, pins, hover])

  function getPinAt(mx: number, my: number): GlobePin | null {
    const cx = size/2, cy = size/2, R = size*0.42
    const s = stateRef.current
    let best: GlobePin | null = null, bestD = 14*14
    for (const pin of pins) {
      const p = rotatePoint(pin.coordinates, s.yaw, s.pitch)
      if (p[2] <= 0) continue
      const px = cx + p[0]*R, py = cy - p[1]*R
      const d = (px-mx)**2 + (py-my)**2
      if (d < bestD) { bestD = d; best = pin }
    }
    return best
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'grab' }}
        onMouseMove={e => {
          const rect = canvasRef.current!.getBoundingClientRect()
          const mx = e.clientX - rect.left, my = e.clientY - rect.top
          const s = stateRef.current
          if (s.dragging) {
            s.yaw += (e.clientX - s.lastX) * 0.005
            s.pitch = Math.max(-1.4, Math.min(1.4, s.pitch - (e.clientY - s.lastY) * 0.005))
            s.lastX = e.clientX; s.lastY = e.clientY; return
          }
          const p = getPinAt(mx, my)
          setHover(p)
          canvasRef.current!.style.cursor = p ? 'pointer' : 'grab'
        }}
        onMouseDown={e => { const s = stateRef.current; s.dragging = true; s.lastX = e.clientX; s.lastY = e.clientY; canvasRef.current!.style.cursor = 'grabbing' }}
        onMouseUp={e => {
          const s = stateRef.current
          const wasDrag = Math.abs(e.clientX - s.lastX) > 3 || Math.abs(e.clientY - s.lastY) > 3
          s.dragging = false; canvasRef.current!.style.cursor = 'grab'
          if (!wasDrag && hover && onPinClick) onPinClick(hover)
        }}
        onMouseLeave={() => { setHover(null); stateRef.current.dragging = false }}
      />
      {hover && (
        <div style={{ position: 'absolute', left: 12, top: 12, background: 'rgba(15,23,42,0.92)', color: '#fff', padding: '10px 14px', borderRadius: 10, fontSize: 12.5, minWidth: 200, maxWidth: 240, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', pointerEvents: 'none' }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{hover.name}</div>
          <div style={{ opacity: 0.7 }}>{hover.city}, {hover.country}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11 }}>
            <span style={{ background: 'rgba(255,255,255,0.12)', padding: '2px 6px', borderRadius: 4 }}>Tier {hover.tier}</span>
            <span style={{ background: 'rgba(255,255,255,0.12)', padding: '2px 6px', borderRadius: 4 }}>{hover.dealsOpen} deals</span>
          </div>
        </div>
      )}
    </div>
  )
}
