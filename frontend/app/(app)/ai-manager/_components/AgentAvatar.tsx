'use client'

interface AgentAvatarProps {
  icon?: string
  iconColor?: string
  profilePhoto?: string
  size?: number
  isManager?: boolean
}

export default function AgentAvatar({ icon, iconColor, profilePhoto, size = 40, isManager }: AgentAvatarProps) {
  const bg = iconColor || (isManager ? '#004ac6' : '#334155')
  const defaultIcon = isManager ? 'psychology' : 'smart_toy'

  if (profilePhoto) {
    return (
      <img
        src={profilePhoto}
        alt="agent"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span className="material-icons-round" style={{ fontSize: size * 0.52, color: '#fff' }}>
        {icon || defaultIcon}
      </span>
    </div>
  )
}
