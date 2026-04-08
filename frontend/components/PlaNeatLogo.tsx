'use client'
import { useState } from 'react'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

export default function PlaNeatLogo({ size = 'md', showText = true }: Props) {
  const [hovered, setHovered] = useState(false)

  const box   = size === 'sm' ? 32 : size === 'md' ? 42 : 72
  const gap   = size === 'sm' ? 8  : size === 'md' ? 10 : 14
  const tMain = size === 'sm' ? 13 : size === 'md' ? 15 : 24
  const tSub  = size === 'sm' ? 9  : size === 'md' ? 10 : 13
  const r     = box * 0.26

  return (
    <div
      className="flex items-center select-none cursor-default"
      style={{ gap }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Icon box ── */}
      <div style={{
        width: box, height: box,
        borderRadius: r,
        flexShrink: 0,
        background: 'linear-gradient(150deg, #1d3461 0%, #0d1f3c 100%)',
        border: `1.5px solid ${hovered ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.15)'}`,
        transition: 'box-shadow 0.35s ease, border-color 0.35s ease',
        boxShadow: hovered
          ? '0 0 25px rgba(96,165,250,0.85), 0 0 50px rgba(59,130,246,0.6), inset 0 1px 0 rgba(255,255,255,0.25)'
          : '0 4px 16px rgba(0,0,0,0.65), 0 0 20px rgba(29,78,216,0.15), inset 0 1px 0 rgba(255,255,255,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* top shine */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '45%',
          background: 'linear-gradient(180deg,rgba(255,255,255,0.12) 0%,transparent 100%)',
          borderRadius: `${r}px ${r}px 0 0`,
          pointerEvents: 'none',
        }}/>

        {/* SVG icon — clean monogram */}
        <svg width={box * 0.72} height={box * 0.72} viewBox="0 0 52 52" fill="none">
          {/* ── P shape (custom path, not text) ── */}
          <rect x="6"  y="8"  width="5" height="36" rx="2.5" fill="white"/>
          <rect x="6"  y="8"  width="18" height="5"  rx="2.5" fill="white"/>
          <rect x="6"  y="24" width="18" height="5"  rx="2.5" fill="white"/>
          <rect x="19" y="8"  width="5"  height="21" rx="2.5" fill="white"/>

          {/* ── N shape ── */}
          <rect x="28" y="14" width="4"  height="24" rx="2" fill="rgba(147,210,255,0.98)"/>
          <rect x="40" y="14" width="4"  height="24" rx="2" fill="rgba(147,210,255,0.98)"/>
          {/* diagonal of N */}
          <line x1="28" y1="14" x2="44" y2="38" stroke="rgba(147,210,255,1)" strokeWidth="4" strokeLinecap="round"/>

          {/* ── dot accent (top right) ── */}
          <circle cx="46" cy="9" r="4" fill="#60a5fa">
            <animate attributeName="r" values="3.8;4.4;3.8" dur="2.8s" repeatCount="indefinite"/>
          </circle>
          <circle cx="45.2" cy="8.2" r="1.5" fill="white" opacity="0.85"/>
        </svg>
      </div>

      {/* ── Text label ── */}
      {showText && (
        <div>
          <div style={{
            fontWeight: 700,
            fontSize: tMain,
            color: 'white',
            lineHeight: 1.15,
            letterSpacing: '-0.3px',
            textShadow: hovered
              ? '0 0 12px rgba(147,197,253,0.9), 0 0 24px rgba(96,165,250,0.55)'
              : '0 2px 4px rgba(0,0,0,0.35)',
            transition: 'text-shadow 0.35s ease',
          }}>
            PlaNeat
          </div>
          <div style={{
            fontSize: tSub,
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 500,
            letterSpacing: '0.5px',
          }}>
            Support
          </div>
        </div>
      )}
    </div>
  )
}
