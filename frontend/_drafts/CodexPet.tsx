'use client'

import { useEffect, useMemo, useState } from 'react'

type PetMood = 'idle' | 'run' | 'think'

const MOODS: Array<{ id: PetMood; label: string; icon: string; line: string }> = [
  { id: 'idle', label: 'Idle', icon: 'radio_button_checked', line: 'Standing by' },
  { id: 'run', label: 'Run', icon: 'directions_run', line: 'On it' },
  { id: 'think', label: 'Think', icon: 'psychology', line: 'Thinking' },
]

export default function CodexPet() {
  const [mood, setMood] = useState<PetMood>('idle')
  const [compact, setCompact] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (compact || !visible) return

    const timer = window.setInterval(() => {
      setMood((current) => {
        if (current === 'think') return 'idle'
        return Math.random() > 0.55 ? 'run' : 'idle'
      })
    }, 6500)

    return () => window.clearInterval(timer)
  }, [compact, visible])

  const active = useMemo(() => MOODS.find((item) => item.id === mood) ?? MOODS[0], [mood])

  if (!visible) {
    return (
      <button
        type="button"
        aria-label="Show Codex Pet"
        className="codex-pet-restore"
        onClick={() => setVisible(true)}
      >
        <span className="material-icons-round">smart_toy</span>
        <style jsx>{styles}</style>
      </button>
    )
  }

  return (
    <div className={`codex-pet ${compact ? 'is-compact' : ''}`} aria-live="polite">
      {!compact && (
        <div className="codex-pet-panel">
          <div>
            <div className="codex-pet-title">Codex Pet</div>
            <div className="codex-pet-line">{active.line}</div>
          </div>
          <div className="codex-pet-actions">
            <button type="button" aria-label="Compact Codex Pet" onClick={() => setCompact(true)}>
              <span className="material-icons-round">remove</span>
            </button>
            <button type="button" aria-label="Hide Codex Pet" onClick={() => setVisible(false)}>
              <span className="material-icons-round">close</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`codex-pet-stage mood-${mood}`}
        aria-label={compact ? 'Expand Codex Pet' : 'Change Codex Pet mood'}
        onClick={() => {
          if (compact) {
            setCompact(false)
            return
          }
          const currentIndex = MOODS.findIndex((item) => item.id === mood)
          setMood(MOODS[(currentIndex + 1) % MOODS.length].id)
        }}
      >
        <span className="codex-pet-shadow" />
        <span className="codex-pet-bot">
          <span className="codex-pet-antenna" />
          <span className="codex-pet-head">
            <span className="codex-pet-eye left" />
            <span className="codex-pet-eye right" />
          </span>
          <span className="codex-pet-body">
            <span className="codex-pet-core" />
          </span>
          <span className="codex-pet-arm left" />
          <span className="codex-pet-arm right" />
          <span className="codex-pet-leg left" />
          <span className="codex-pet-leg right" />
        </span>
      </button>

      {!compact && (
        <div className="codex-pet-controls" role="group" aria-label="Codex Pet mood">
          {MOODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === mood ? 'active' : ''}
              aria-label={`Set ${item.label} mood`}
              title={item.label}
              onClick={() => setMood(item.id)}
            >
              <span className="material-icons-round">{item.icon}</span>
            </button>
          ))}
        </div>
      )}

      <style jsx>{styles}</style>
    </div>
  )
}

const styles = `
  .codex-pet {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 80;
    display: grid;
    justify-items: end;
    gap: 8px;
    pointer-events: none;
  }

  .codex-pet-panel,
  .codex-pet-stage,
  .codex-pet-controls,
  .codex-pet-restore {
    pointer-events: auto;
  }

  .codex-pet-panel {
    min-width: 174px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 10px 10px 12px;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
    backdrop-filter: blur(12px);
  }

  .codex-pet-title {
    font-size: 12px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.1;
  }

  .codex-pet-line {
    margin-top: 2px;
    font-size: 11px;
    color: #64748b;
  }

  .codex-pet-actions {
    display: flex;
    gap: 4px;
  }

  .codex-pet-actions button,
  .codex-pet-controls button,
  .codex-pet-restore {
    border: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #475569;
    background: #f1f5f9;
    transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
  }

  .codex-pet-actions button {
    width: 26px;
    height: 26px;
    border-radius: 8px;
  }

  .codex-pet-actions button:hover,
  .codex-pet-controls button:hover,
  .codex-pet-restore:hover {
    color: #0f172a;
    background: #e0f2fe;
    transform: translateY(-1px);
  }

  .material-icons-round {
    font-size: 16px;
  }

  .codex-pet-stage {
    width: 88px;
    height: 82px;
    position: relative;
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }

  .codex-pet-shadow {
    position: absolute;
    left: 20px;
    right: 16px;
    bottom: 5px;
    height: 12px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.16);
    filter: blur(1px);
    animation: pet-shadow 2.8s ease-in-out infinite;
  }

  .codex-pet-bot {
    position: absolute;
    left: 17px;
    bottom: 10px;
    width: 54px;
    height: 62px;
    animation: pet-idle 2.8s ease-in-out infinite;
  }

  .mood-run .codex-pet-bot {
    animation: pet-run 0.58s ease-in-out infinite;
  }

  .mood-think .codex-pet-bot {
    animation: pet-think 1.2s ease-in-out infinite;
  }

  .codex-pet-antenna {
    position: absolute;
    left: 25px;
    top: 0;
    width: 4px;
    height: 11px;
    border-radius: 99px;
    background: #0f172a;
  }

  .codex-pet-antenna::after {
    content: '';
    position: absolute;
    left: -4px;
    top: -7px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.18);
  }

  .codex-pet-head {
    position: absolute;
    left: 8px;
    top: 11px;
    width: 38px;
    height: 29px;
    border-radius: 13px 13px 11px 11px;
    background: linear-gradient(145deg, #f8fafc, #cbd5e1);
    border: 2px solid #0f172a;
    box-shadow: inset 0 -5px 0 rgba(15, 23, 42, 0.08);
  }

  .codex-pet-eye {
    position: absolute;
    top: 11px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #0ea5e9;
    box-shadow: 0 0 8px rgba(14, 165, 233, 0.95);
    animation: pet-blink 4s infinite;
  }

  .codex-pet-eye.left { left: 9px; }
  .codex-pet-eye.right { right: 9px; }

  .mood-think .codex-pet-eye {
    width: 11px;
    height: 3px;
    top: 13px;
    border-radius: 99px;
  }

  .codex-pet-body {
    position: absolute;
    left: 12px;
    top: 38px;
    width: 30px;
    height: 22px;
    border-radius: 10px 10px 12px 12px;
    background: linear-gradient(145deg, #1d4ed8, #0f172a);
    border: 2px solid #0f172a;
  }

  .codex-pet-core {
    position: absolute;
    left: 10px;
    top: 7px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.95);
  }

  .mood-run .codex-pet-core {
    background: #f59e0b;
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.95);
  }

  .mood-think .codex-pet-core {
    background: #8b5cf6;
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.95);
  }

  .codex-pet-arm,
  .codex-pet-leg {
    position: absolute;
    border-radius: 99px;
    background: #0f172a;
    transform-origin: top center;
  }

  .codex-pet-arm {
    top: 42px;
    width: 5px;
    height: 17px;
  }

  .codex-pet-arm.left {
    left: 6px;
    transform: rotate(18deg);
  }

  .codex-pet-arm.right {
    right: 6px;
    transform: rotate(-18deg);
  }

  .codex-pet-leg {
    top: 57px;
    width: 5px;
    height: 15px;
  }

  .codex-pet-leg.left {
    left: 18px;
    transform: rotate(12deg);
  }

  .codex-pet-leg.right {
    right: 18px;
    transform: rotate(-12deg);
  }

  .mood-run .codex-pet-arm.left,
  .mood-run .codex-pet-leg.right {
    animation: pet-limb-a 0.58s ease-in-out infinite;
  }

  .mood-run .codex-pet-arm.right,
  .mood-run .codex-pet-leg.left {
    animation: pet-limb-b 0.58s ease-in-out infinite;
  }

  .codex-pet-controls {
    display: flex;
    gap: 6px;
    padding: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(15, 23, 42, 0.08);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.13);
    backdrop-filter: blur(12px);
  }

  .codex-pet-controls button,
  .codex-pet-restore {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }

  .codex-pet-controls button.active {
    color: #fff;
    background: #2563eb;
  }

  .codex-pet.is-compact {
    gap: 0;
  }

  .codex-pet.is-compact .codex-pet-stage {
    width: 72px;
    height: 72px;
  }

  .codex-pet-restore {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 80;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.2);
  }

  @keyframes pet-idle {
    0%, 100% { transform: translateY(0) rotate(-1deg); }
    50% { transform: translateY(-5px) rotate(1deg); }
  }

  @keyframes pet-run {
    0%, 100% { transform: translate(0, 0) rotate(-5deg); }
    50% { transform: translate(-10px, -4px) rotate(5deg); }
  }

  @keyframes pet-think {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-3px) scale(0.98); }
  }

  @keyframes pet-shadow {
    0%, 100% { transform: scaleX(1); opacity: 0.16; }
    50% { transform: scaleX(0.75); opacity: 0.1; }
  }

  @keyframes pet-blink {
    0%, 92%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.12); }
  }

  @keyframes pet-limb-a {
    0%, 100% { transform: rotate(28deg); }
    50% { transform: rotate(-28deg); }
  }

  @keyframes pet-limb-b {
    0%, 100% { transform: rotate(-28deg); }
    50% { transform: rotate(28deg); }
  }

  @media (max-width: 768px) {
    .codex-pet,
    .codex-pet-restore {
      right: 12px;
      bottom: 12px;
    }

    .codex-pet-panel {
      min-width: 150px;
      max-width: calc(100vw - 24px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .codex-pet-bot,
    .codex-pet-shadow,
    .codex-pet-eye,
    .mood-run .codex-pet-arm.left,
    .mood-run .codex-pet-arm.right,
    .mood-run .codex-pet-leg.left,
    .mood-run .codex-pet-leg.right {
      animation: none;
    }
  }
`
