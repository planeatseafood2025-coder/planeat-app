'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { User } from '@/types'
import { PAGE_ACCESS, ROLE_LABELS } from '@/types'
import PlaNeatLogo from '@/components/PlaNeatLogo'

interface NavItem {
  page: string
  label: string
  icon: string
  soon?: boolean
}

interface NavSubGroup {
  label: string
  icon: string
  items: NavItem[]
}

interface NavSection {
  label: string
  items?: NavItem[]
  subGroups?: NavSubGroup[]
}

const NAV: NavSection[] = [
  {
    label: 'การเงิน',
    items: [
      { page: 'expense-control', label: 'ระบบควบคุมค่าใช้จ่าย', icon: 'receipt_long' },
    ],
  },
  {
    label: 'สำนักงาน',
    items: [
      { page: 'employees',  label: 'ข้อมูลพนักงาน', icon: 'groups',      soon: true },
      { page: 'inventory',  label: 'คลังสินค้า',     icon: 'inventory_2' },
      { page: 'documents',  label: 'เอกสาร',          icon: 'folder_open', soon: true },
    ],
  },
  {
    label: 'การสื่อสาร',
    items: [
      { page: 'chat', label: 'แชท', icon: 'chat' },
    ],
  },
  {
    label: 'การตลาดและการขาย',
    subGroups: [
      {
        label: 'CRM ต่างประเทศ',
        icon: 'language',
        items: [
          { page: 'crm-b2b/overview',    label: 'Globe Overview',  icon: 'public' },
          { page: 'crm-b2b/accounts',    label: 'บริษัทลูกค้า',    icon: 'business' },
          { page: 'crm-b2b/contacts',    label: 'ผู้ติดต่อ',        icon: 'contacts' },
          { page: 'crm-b2b/deals',       label: 'Deal Pipeline',   icon: 'view_kanban' },
          { page: 'crm-b2b/activities',  label: 'Activity Log',    icon: 'timeline' },
          { page: 'crm-b2b/reminders',   label: 'Reminders',       icon: 'notifications_active' },
          { page: 'crm-b2b/settings',   label: 'ตั้งค่า CRM',       icon: 'settings' },
          { page: 'crm-b2b/campaigns',   label: 'แคมเปญอีเมล',     icon: 'campaign' },
        ],
      },
    ],
  },
  {
    label: 'IT & Dev',
    items: [
      { page: 'it-access',    label: 'Access Control',    icon: 'admin_panel_settings' },
      { page: 'integrations', label: 'การเชื่อมต่อระบบ', icon: 'hub' },
      { page: 'ai-manager',   label: '🧠 AI Manager',     icon: 'psychology' },
    ],
  },
]

interface SidebarProps {
  user: User
  onLogout: () => void
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSubGroups, setOpenSubGroups] = useState<Record<string, boolean>>({ 'CRM ต่างประเทศ': true })

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const currentPath = pathname.replace(/^\//, '')

  function navTo(page: string) {
    const allowed = PAGE_ACCESS[page] || ['admin']
    if (!allowed.includes(user.role)) return
    router.push(`/${page === 'overview' ? 'expense-control' : page}`)
    setMobileOpen(false)
  }

  function isActive(page: string) {
    if (page === 'overview') return currentPath === 'expense-control'
    return currentPath === page || currentPath.startsWith(page + '/')
  }

  function isVisible(page: string) {
    const allowed = PAGE_ACCESS[page] || ['admin']
    return allowed.includes(user.role)
  }

  function toggleSubGroup(label: string) {
    setOpenSubGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  function renderItems(items: NavItem[]) {
    return items.filter(item => isVisible(item.page)).map(item => (
      <button
        key={item.page}
        data-page={item.page}
        onClick={() => !item.soon && navTo(item.page)}
        className={`nav-item w-full text-left ${isActive(item.page) ? 'active' : ''}`}
        style={item.soon ? { opacity: 0.5, cursor: 'default' } : {}}
      >
        <span className="material-icons-round nav-icon">{item.icon}</span>
        <span className="nav-label">{item.label}</span>
        {item.soon && <span className="badge-soon">เร็วๆนี้</span>}
      </button>
    ))
  }

  return (
    <>
      {mobileOpen && (
        <div id="sidebar-overlay" className="visible" onClick={() => setMobileOpen(false)} />
      )}

      <div id="sidebar" className={`${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {!collapsed && <PlaNeatLogo size="sm" showText={true} />}
          <button onClick={() => setCollapsed(!collapsed)} className="text-white opacity-60 hover:opacity-100 transition-opacity p-1 rounded">
            <span className="material-icons-round" style={{ fontSize: 20 }}>
              {collapsed ? 'menu_open' : 'menu'}
            </span>
          </button>
        </div>

        {/* User info */}
        <button
          onClick={() => router.push('/profile')}
          className="p-3 mx-2 my-3 rounded-xl w-auto text-left"
          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', display: 'block' }}
        >
          <div className="flex items-center gap-3">
            {user.profilePhoto ? (
              <img src={user.profilePhoto} alt="avatar" className="w-8 h-8 rounded-full flex-shrink-0" style={{ objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                <span className="material-icons-round text-white" style={{ fontSize: 18 }}>person</span>
              </div>
            )}
            {!collapsed && (
              <div className="sidebar-text min-w-0">
                <p className="text-white text-xs font-semibold truncate">
                  {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name}
                </p>
                <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            )}
          </div>
        </button>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-1">
          {NAV.map((section, si) => {
            const visibleDirectItems = (section.items || []).filter(item => isVisible(item.page))
            const hasVisibleSubGroups = (section.subGroups || []).some(sg => sg.items.some(item => isVisible(item.page)))
            if (visibleDirectItems.length === 0 && !hasVisibleSubGroups) return null

            return (
              <div key={si}>
                {section.label && !collapsed && (
                  <div className="nav-section-label">{section.label}</div>
                )}

                {/* Direct items */}
                {renderItems(section.items || [])}

                {/* Sub-groups */}
                {(section.subGroups || []).map(sg => {
                  const visibleSgItems = sg.items.filter(item => isVisible(item.page))
                  if (visibleSgItems.length === 0) return null
                  const isOpen = openSubGroups[sg.label] !== false

                  return (
                    <div key={sg.label}>
                      {/* Sub-group header */}
                      <button
                        onClick={() => !collapsed && toggleSubGroup(sg.label)}
                        className="nav-item w-full text-left"
                        style={{ opacity: 0.85 }}
                      >
                        <span className="material-icons-round nav-icon" style={{ color: 'rgba(255,255,255,0.6)' }}>{sg.icon}</span>
                        <span className="nav-label" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 600, letterSpacing: '0.3px' }}>{sg.label}</span>
                        {!collapsed && (
                          <span className="material-icons-round" style={{ fontSize: 16, marginLeft: 'auto', color: 'rgba(255,255,255,0.4)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            expand_more
                          </span>
                        )}
                      </button>

                      {/* Sub-group items */}
                      {(isOpen || collapsed) && (
                        <div style={{ paddingLeft: collapsed ? 0 : 8 }}>
                          {visibleSgItems.map(item => (
                            <button
                              key={item.page}
                              data-page={item.page}
                              onClick={() => !item.soon && navTo(item.page)}
                              className={`nav-item w-full text-left ${isActive(item.page) ? 'active' : ''}`}
                              style={item.soon ? { opacity: 0.5, cursor: 'default' } : {}}
                            >
                              <span className="material-icons-round nav-icon">{item.icon}</span>
                              <span className="nav-label">{item.label}</span>
                              {item.soon && <span className="badge-soon">เร็วๆนี้</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Logout */}
        <div className="p-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <button onClick={onLogout} className="nav-item w-full text-left" style={{ color: 'rgba(255,99,99,0.8)' }}>
            <span className="material-icons-round nav-icon">logout</span>
            <span className="nav-label">ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </>
  )
}

export function useSidebarToggle() {
  return {
    toggle: () => {
      const sb = document.getElementById('sidebar')
      if (!sb) return
      if (window.innerWidth <= 768) {
        sb.classList.toggle('mobile-open')
        const ov = document.getElementById('sidebar-overlay')
        if (ov) ov.classList.toggle('visible')
      } else {
        sb.classList.toggle('collapsed')
      }
    }
  }
}
