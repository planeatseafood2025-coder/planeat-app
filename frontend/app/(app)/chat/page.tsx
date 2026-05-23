'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { chatApi, notificationApi, agentApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import type { ChatContact, ChatMessage, Notification } from '@/types'
import { ROLE_LABELS } from '@/types'

// SSE replaces polling — ค่านี้ยังเก็บไว้เป็น fallback timeout
const POLL_MS = 3000

function AgentAvatarInline({ icon, color, photo, size = 36 }: { icon?: string; color?: string; photo?: string; size?: number }) {
  if (photo) return <img src={photo} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color || '#004ac6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span className="material-icons-round" style={{ fontSize: size * 0.52, color: '#fff' }}>{icon || 'smart_toy'}</span>
    </div>
  )
}

function Avatar({ contact, size = 36 }: { contact: ChatContact; size?: number }) {
  if (contact.profilePhoto) {
    return (
      <img
        src={contact.profilePhoto}
        alt={contact.username}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span className="material-icons-round" style={{ fontSize: size * 0.5, color: '#2563eb' }}>person</span>
    </div>
  )
}

export default function ChatPage() {
  const session = getSession()
  const me = session?.username ?? ''

  const [contacts, setContacts] = useState<ChatContact[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ChatContact | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  // Track which contacts sent messages since last read (for unread badge)
  const [unreadFrom, setUnreadFrom] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatSseRef = useRef<EventSource | null>(null)
  const notifSseRef = useRef<EventSource | null>(null)

  // Agent state
  const [agents, setAgents] = useState<ChatContact[]>([])
  const [pendingEmail, setPendingEmail] = useState<object | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load contacts once
  useEffect(() => {
    chatApi.getContacts().then((res: unknown) => {
      const r = res as { contacts?: ChatContact[] }
      setContacts(r.contacts || [])
      setLoadingContacts(false)
    }).catch(() => setLoadingContacts(false))
  }, [])

  // Load agents once
  useEffect(() => {
    agentApi.listAgents().then((r: any) => {
      const agentContacts: ChatContact[] = (r.agents || []).map((a: any) => ({
        username: `__agent__${a.id}`,
        name: a.name,
        role: 'general_user' as any,
        isAgent: true,
        agentAvatar: a.avatar,
        agentAvatarColor: a.avatar_color,
        agentProfilePhoto: a.profile_photo,
      }))
      setAgents(agentContacts)
    }).catch(() => {})
  }, [])

  // SSE notifications — ตรวจหาข้อความใหม่จาก unread chat notifications
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const es = new EventSource(`/api/sse/notifications?token=${encodeURIComponent(token)}`)
    es.addEventListener('notification', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        const chatNotifs = (data.notifications || []).filter((n: { read: boolean; type: string }) => !n.read && n.type === 'general')
        setUnreadFrom(new Set(chatNotifs.map((n: { senderUsername: string }) => n.senderUsername)))
      } catch {}
    })
    notifSseRef.current = es
    return () => { es.close(); notifSseRef.current = null }
  }, [])

  const loadMessages = useCallback(async (otherUsername: string) => {
    try {
      const res = await chatApi.getMessages(otherUsername) as { messages?: ChatMessage[] }
      setMessages(res.messages || [])
    } catch {}
  }, [])

  // When contact changes, load messages and open SSE stream
  useEffect(() => {
    if (!selected) return

    if (selected.isAgent) {
      const agentId = selected.username.replace('__agent__', '')
      setMessages([])
      setPendingEmail(null)
      setLoadingMsgs(true)
      agentApi.getHistory(agentId).then((r: any) => {
        const msgs: ChatMessage[] = (r.messages || []).map((m: any, i: number) => ({
          id: `hist-${i}`,
          roomId: agentId,
          sender: m.role === 'user' ? (me || 'me') : selected.username,
          content: m.content,
          createdAt: m.created_at,
          type: 'text' as const,
        }))
        setMessages(msgs)
      }).catch(() => {}).finally(() => setLoadingMsgs(false))
      return
    }

    setLoadingMsgs(true)
    setUnreadFrom(prev => { const s = new Set(prev); s.delete(selected.username); return s })
    loadMessages(selected.username).finally(() => setLoadingMsgs(false))

    // ปิด stream เก่า
    chatSseRef.current?.close()
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    const es = new EventSource(`/api/sse/chat/${encodeURIComponent(selected.username)}?token=${encodeURIComponent(token)}`)
    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        setMessages(data.messages || [])
      } catch {}
    })
    es.onerror = () => {
      // SSE error → fallback polling
      es.close()
      pollRef.current = setInterval(() => loadMessages(selected.username), POLL_MS)
    }
    chatSseRef.current = es
    return () => { es.close(); chatSseRef.current = null }
  }, [selected, loadMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if ((!input.trim() && !imageFile) || !selected || sending) return
    setSending(true)

    if (selected.isAgent) {
      const agentId = selected.username.replace('__agent__', '')
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        roomId: agentId,
        sender: me,
        content: input || '📷 รูปภาพ',
        createdAt: new Date().toISOString(),
      }
      setMessages(prev => [...prev, userMsg])
      const currentInput = input
      setInput('')

      let imageBase64: string | undefined
      let imageMediaType: string | undefined
      if (imageFile) {
        const buf = await imageFile.arrayBuffer()
        imageBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        imageMediaType = imageFile.type
        setImageFile(null)
      }

      try {
        const res = await agentApi.chat(agentId, currentInput, {
          imageBase64,
          imageMediaType,
          pendingEmail: pendingEmail ?? undefined,
        }) as any
        const agentMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          roomId: agentId,
          sender: selected.username,
          content: res.reply,
          createdAt: new Date().toISOString(),
        }
        setMessages(prev => [...prev, agentMsg])
        setPendingEmail(res.pending_email ?? null)
      } catch {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          roomId: agentId,
          sender: selected.username,
          content: '❌ เกิดข้อผิดพลาดครับ กรุณาลองใหม่',
          createdAt: new Date().toISOString(),
        }])
      }
      setSending(false)
      return
    }

    // Regular chat
    if (!input.trim()) { setSending(false); return }
    const text = input.trim()
    setInput('')
    try {
      await chatApi.sendMessage(selected.username, text)
      await loadMessages(selected.username)
    } catch {} finally { setSending(false) }
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const filteredContacts = contacts.filter(c =>
    c.username.toLowerCase().includes(search.toLowerCase()) ||
    (c.firstName && c.firstName.toLowerCase().includes(search.toLowerCase())) ||
    (c.lastName && c.lastName.toLowerCase().includes(search.toLowerCase())) ||
    (c.nickname && c.nickname.toLowerCase().includes(search.toLowerCase()))
  )

  function displayName(c: ChatContact) {
    if (c.firstName || c.lastName) return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()
    return c.username
  }

  // Group messages by date
  function getDateGroups() {
    const groups: { date: string; msgs: ChatMessage[] }[] = []
    for (const m of messages) {
      const d = formatDate(m.createdAt)
      const last = groups[groups.length - 1]
      if (last && last.date === d) last.msgs.push(m)
      else groups.push({ date: d, msgs: [m] })
    }
    return groups
  }

  // Find contact for a message sender (for avatar in chat)
  const contactMap = Object.fromEntries(contacts.map(c => [c.username, c]))

  return (
    <div className="page-wrapper" style={{ padding: 0, overflow: 'hidden', height: 'calc(100vh - 64px)' }}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* ── Contact list ── */}
        <div style={{ width: 280, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'white' }}>
          <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 10 }}>แชท</h2>
            <div style={{ position: 'relative' }}>
              <span className="material-icons-round" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#94a3b8' }}>search</span>
              <input
                type="text"
                placeholder="ค้นหาผู้ใช้..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 8px 6px 30px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* AI Agents */}
            {agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase())).map(agent => (
              <button key={agent.username} onClick={() => { setSelected(agent); setMessages([]) }}
                style={{
                  width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  background: selected?.username === agent.username ? '#eff6ff' : '#fff',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderLeft: selected?.username === agent.username ? '3px solid #2563eb' : '3px solid transparent',
                  borderBottom: '1px solid #dbeafe',
                }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <AgentAvatarInline icon={agent.agentAvatar} color={agent.agentAvatarColor} photo={(agent as any).agentProfilePhoto} size={38} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, background: '#10b981', borderRadius: '50%', border: '2px solid #fff' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1d4ed8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#3b82f6' }}>AI · ออนไลน์ตลอดเวลา</p>
                </div>
              </button>
            ))}
            {agents.length > 0 && <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />}

            {/* Regular contacts */}
            {loadingContacts ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                <span className="material-icons-round spin" style={{ fontSize: 24 }}>refresh</span>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>ไม่พบผู้ใช้</div>
            ) : filteredContacts.map(c => {
              const hasUnread = unreadFrom.has(c.username)
              return (
                <button key={c.username} onClick={() => setSelected(c)}
                  style={{
                    width: '100%', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
                    background: selected?.username === c.username ? '#eff6ff' : hasUnread ? '#fefce8' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderLeft: selected?.username === c.username ? '3px solid #2563eb' : hasUnread ? '3px solid #f59e0b' : '3px solid transparent',
                    position: 'relative',
                  }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar contact={c} size={38} />
                    {hasUnread && (
                      <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#ef4444', border: '2px solid white' }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: hasUnread ? 700 : 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName(c)}{c.nickname ? ` (${c.nickname})` : ''}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.jobTitle ? `${c.jobTitle} · ` : ''}{ROLE_LABELS[c.role] ?? c.role}
                    </p>
                  </div>
                  {hasUnread && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Chat window ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <span className="material-icons-round" style={{ fontSize: 48, marginBottom: 12 }}>chat_bubble_outline</span>
              <p style={{ fontSize: 14 }}>เลือกผู้ใช้เพื่อเริ่มแชท</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: '12px 20px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                {selected.isAgent ? (
                  <AgentAvatarInline icon={selected.agentAvatar} color={(selected as any).agentAvatarColor} photo={(selected as any).agentProfilePhoto} size={40} />
                ) : (
                  <Avatar contact={selected} size={40} />
                )}
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: selected.isAgent ? '#1d4ed8' : '#1e293b' }}>
                    {selected.name}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: selected.isAgent ? '#3b82f6' : '#94a3b8' }}>
                    {selected.isAgent ? 'AI Assistant · ออนไลน์ตลอดเวลา' : (selected.jobTitle ? `${selected.jobTitle} · ` : '') + (ROLE_LABELS[selected.role] ?? selected.role)}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {loadingMsgs ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: 40 }}>
                    <span className="material-icons-round spin" style={{ fontSize: 24 }}>refresh</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: 40, fontSize: 13 }}>
                    ยังไม่มีข้อความ — เริ่มต้นสนทนาได้เลย
                  </div>
                ) : getDateGroups().map(group => (
                  <div key={group.date}>
                    <div style={{ textAlign: 'center', margin: '12px 0' }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 10px', borderRadius: 20 }}>{group.date}</span>
                    </div>
                    {group.msgs.map(msg => {
                      const isMine = msg.sender === me
                      const isAgentMsg = msg.sender.startsWith('__agent__')
                      const senderContact = !isMine && !isAgentMsg ? (contactMap[msg.sender] ?? { username: msg.sender, name: msg.sender, role: 'general_user' as const }) : null
                      return (
                        <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
                          {/* Sender avatar (others only) */}
                          {!isMine && isAgentMsg && (
                            <div style={{ marginBottom: 2 }}>
                              <AgentAvatarInline icon={selected?.agentAvatar} color={(selected as any)?.agentAvatarColor} photo={(selected as any)?.agentProfilePhoto} size={28} />
                            </div>
                          )}
                          {!isMine && senderContact && (
                            <div style={{ flexShrink: 0, marginBottom: 2 }}>
                              <Avatar contact={senderContact as ChatContact} size={28} />
                            </div>
                          )}
                          <div style={{ maxWidth: '65%' }}>
                            {/* Sender name (others only) */}
                            {!isMine && senderContact && (
                              <p style={{ margin: '0 0 3px 4px', fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                {displayName(senderContact as ChatContact)}
                                {(senderContact as ChatContact).jobTitle ? ` · ${(senderContact as ChatContact).jobTitle}` : ''}
                              </p>
                            )}
                            <div style={{
                              padding: '8px 12px', borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                              background: isMine ? '#2563eb' : 'white',
                              color: isMine ? 'white' : '#1e293b',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                            }}>
                              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.content}</p>
                              <p style={{ margin: '2px 0 0', fontSize: 10, opacity: 0.6, textAlign: 'right' }}>{formatTime(msg.createdAt)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Pending email banner */}
              {pendingEmail && (
                <div style={{ padding: '8px 16px', background: '#fef3c7', borderTop: '1px solid #f59e0b', fontSize: 12, color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📧 รอ confirm ส่งอีเมล — พิมพ์ "โอเค ส่งได้เลย" เพื่อส่งจริง</span>
                  <button onClick={() => setPendingEmail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 16 }}>✕</button>
                </div>
              )}

              {/* Input */}
              <div style={{ padding: '12px 20px', background: 'white', borderTop: pendingEmail ? 'none' : '1px solid #e2e8f0', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Avatar contact={session ? { username: me, name: me, role: 'general_user', profilePhoto: session.profilePhoto } : { username: me, name: me, role: 'general_user' }} size={32} />
                <input
                  type="text"
                  placeholder={selected?.isAgent ? 'พิมพ์คำสั่งให้ AI...' : `พิมพ์ข้อความถึง ${displayName(selected)}...`}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  disabled={sending}
                  style={{ flex: 1, padding: '8px 14px', borderRadius: 24, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#f8fafc' }}
                />
                {selected?.isAgent && (
                  <>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setImageFile(e.target.files?.[0] || null)} />
                    <button onClick={() => fileInputRef.current?.click()} title="แนบนามบัตร / รูปภาพ"
                      style={{ background: imageFile ? '#eff6ff' : 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0 10px', cursor: 'pointer', color: imageFile ? '#2563eb' : '#94a3b8', height: 40, display: 'flex', alignItems: 'center' }}>
                      <span className="material-icons-round" style={{ fontSize: 18 }}>{imageFile ? 'image' : 'attach_file'}</span>
                    </button>
                  </>
                )}
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && !imageFile) || sending}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: (input.trim() || imageFile) ? 'pointer' : 'not-allowed',
                    background: (input.trim() || imageFile) ? '#2563eb' : '#e2e8f0',
                    color: (input.trim() || imageFile) ? 'white' : '#94a3b8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                  <span className="material-icons-round" style={{ fontSize: 18 }}>{sending && selected?.isAgent ? 'pending' : 'send'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
