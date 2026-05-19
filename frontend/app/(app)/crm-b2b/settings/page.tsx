'use client'
import { useEffect, useMemo, useState } from 'react'
import { crmB2bApi } from '@/lib/api'

type Settings = {
  aiProvider?: string
  aiModel?: string
  aiApiKey?: string
  smtpEmail?: string
  smtpPassword?: string
  smtpServer?: string
  smtpPort?: number
  smtpFromName?: string
  lineGroupId?: string
  lineOaToken?: string
  lineNotifyToken?: string
  updatedAt?: string
  updatedBy?: string
}

const AI_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic', models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'] },
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { value: 'gemini', label: 'Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box',
}

export default function CrmB2bSettingsPage() {
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    ;(async () => {
      try {
        const r = await (crmB2bApi as any).getSettings()
        setSettings(r?.settings || {})
      } catch {
        setFlash({ type: 'err', msg: 'โหลดการตั้งค่าไม่สำเร็จ' })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function setField<K extends keyof Settings>(k: K, v: Settings[K]) {
    setSettings(prev => ({ ...prev, [k]: v }))
  }

  const selectedProvider = useMemo(() => {
    const p = AI_PROVIDERS.find(x => x.value === settings.aiProvider)
    return p || AI_PROVIDERS[0]
  }, [settings.aiProvider])

  useEffect(() => {
    if (!settings.aiProvider) {
      setField('aiProvider', AI_PROVIDERS[0].value)
      setField('aiModel', AI_PROVIDERS[0].models[0])
      return
    }
    if (!selectedProvider.models.includes(settings.aiModel || '')) {
      setField('aiModel', selectedProvider.models[0])
    }
  }, [settings.aiProvider])

  async function save() {
    setSaving(true)
    setFlash(null)
    try {
      await (crmB2bApi as any).updateSettings(settings)
      setFlash({ type: 'ok', msg: 'บันทึกการตั้งค่าเรียบร้อย' })
    } catch {
      setFlash({ type: 'err', msg: 'บันทึกการตั้งค่าไม่สำเร็จ' })
    } finally {
      setSaving(false)
    }
  }

  async function testEmail() {
    setTesting(true)
    setFlash(null)
    try {
      const r = await (crmB2bApi as any).testEmail()
      setFlash({ type: r?.success ? 'ok' : 'err', msg: r?.message || 'ทดสอบเสร็จแล้ว' })
    } catch {
      setFlash({ type: 'err', msg: 'ทดสอบอีเมลไม่สำเร็จ' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div style={{ padding: 28, color: '#94a3b8' }}>กำลังโหลด...</div>

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>ตั้งค่า CRM ต่างประเทศ</h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#64748b' }}>กำหนดค่า AI, อีเมล และ LINE สำหรับทีม</p>
      </div>

      {flash && <div style={{ padding: '12px 16px', borderRadius: 10, background: flash.type === 'ok' ? '#f0fdf4' : '#fef2f2', color: flash.type === 'ok' ? '#15803d' : '#dc2626', fontSize: 14, marginBottom: 18 }}>{flash.msg}</div>}

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 14 }}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 15 }}>AI</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          {AI_PROVIDERS.map(p => (
            <button key={p.value} onClick={() => { setField('aiProvider', p.value); setField('aiModel', p.models[0]) }} style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${settings.aiProvider === p.value ? '#7c3aed' : '#e2e8f0'}`, background: settings.aiProvider === p.value ? '#faf5ff' : '#fff', cursor: 'pointer', fontWeight: 600 }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Model</label>
            <select value={settings.aiModel || ''} onChange={e => setField('aiModel', e.target.value)} style={inputStyle}>
              {selectedProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>API Key</label>
            <div style={{ position: 'relative' }}>
              <input type={showKeys.ai ? 'text' : 'password'} value={settings.aiApiKey || ''} onChange={e => setField('aiApiKey', e.target.value)} style={{ ...inputStyle, paddingRight: 36 }} />
              <button onClick={() => setShowKeys(s => ({ ...s, ai: !s.ai }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>👁</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 14 }}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 15 }}>Email</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input placeholder='อีเมลผู้ส่ง' value={settings.smtpEmail || ''} onChange={e => setField('smtpEmail', e.target.value)} style={inputStyle} />
          <input placeholder='ชื่อผู้ส่ง' value={settings.smtpFromName || ''} onChange={e => setField('smtpFromName', e.target.value)} style={inputStyle} />
          <input placeholder='SMTP Server' value={settings.smtpServer || 'smtp.gmail.com'} onChange={e => setField('smtpServer', e.target.value)} style={inputStyle} />
          <input type='number' placeholder='Port' value={settings.smtpPort || 587} onChange={e => setField('smtpPort', Number(e.target.value) || 587)} style={inputStyle} />
        </div>
        <div style={{ marginTop: 10 }}>
          <input type={showKeys.smtp ? 'text' : 'password'} placeholder='SMTP Password' value={settings.smtpPassword || ''} onChange={e => setField('smtpPassword', e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={testEmail} disabled={testing || !settings.smtpEmail} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #8b5cf6', background: '#faf5ff', color: '#7c3aed', cursor: settings.smtpEmail ? 'pointer' : 'not-allowed' }}>{testing ? 'กำลังทดสอบ...' : 'ทดสอบส่งอีเมล'}</button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 15 }}>LINE</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <input placeholder='LINE OA Token' value={settings.lineOaToken || ''} onChange={e => setField('lineOaToken', e.target.value)} style={inputStyle} />
          <input placeholder='LINE Group ID' value={settings.lineGroupId || ''} onChange={e => setField('lineGroupId', e.target.value)} style={inputStyle} />
          <input placeholder='LINE Notify Token' value={settings.lineNotifyToken || ''} onChange={e => setField('lineNotifyToken', e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {settings.updatedAt && <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>อัปเดตล่าสุด: {new Date(settings.updatedAt).toLocaleString('th-TH')}{settings.updatedBy ? ` โดย ${settings.updatedBy}` : ''}</span>}
        <button onClick={save} disabled={saving} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</button>
      </div>
    </div>
  )
}
