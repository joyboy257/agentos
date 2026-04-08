export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--ui-bg)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <nav
        style={{
          width: 220,
          flexShrink: 0,
          background: 'var(--ui-surface)',
          borderRight: '1px solid var(--ui-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
        }}
      >
        {/* Logo / wordmark */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid var(--ui-border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* AgentOS mark — stylized "A" in indigo */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="var(--ui-accent)" />
              <path
                d="M14 6L20 18H8L14 6Z"
                fill="white"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M10 14h8"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span
              style={{
                fontFamily: "'IBM Plex Serif', Georgia, serif",
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--ui-text)',
                letterSpacing: '-0.02em',
              }}
            >
              AgentOS
            </span>
          </div>
        </div>

        {/* Primary nav */}
        <div style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem href="/canvas" icon="canvas">
            Canvas
          </NavItem>
          <NavItem href="/portfolios" icon="portfolios">
            Portfolios
          </NavItem>
          <NavItem href="/activity" icon="activity">
            Activity
          </NavItem>
          <NavItem href="/memory" icon="memory">
            Memory
          </NavItem>
          <NavItem href="/skills" icon="skills">
            Skills
          </NavItem>
          <NavItem href="/marketplace" icon="marketplace">
            Marketplace
          </NavItem>
          <NavItem href="/governance" icon="governance">
            Governance
          </NavItem>
        </div>

        {/* User / bottom section */}
        <div
          style={{
            padding: '14px 12px',
            borderTop: '1px solid var(--ui-border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--ui-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              M
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ui-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Maria
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ui-text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Starter plan
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main content ─────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}

// ─── NavItem ─────────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon,
  children,
}: {
  href: string
  icon: string
  children: React.ReactNode
}) {
  // We use Suspense-wrapped dynamic import for icons to avoid SSR issues with lucide-react
  return (
    <a
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--ui-text-secondary)',
        textDecoration: 'none',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--ui-accent-subtle)'
        e.currentTarget.style.color = 'var(--ui-text)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--ui-text-secondary)'
      }}
    >
      <NavIcon type={icon} />
      <span>{children}</span>
    </a>
  )
}

// ─── NavIcon ─────────────────────────────────────────────────────────────────

function NavIcon({ type }: { type: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    canvas: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="1" width="6" height="6" rx="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" />
      </svg>
    ),
    portfolios: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4h12M2 8h8M2 12h10" />
      </svg>
    ),
    activity: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1,4 3,4 5,10 8,4 11,10 13,7 15,8" />
      </svg>
    ),
    memory: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2L10.5 6H14L11 9L12.5 13L8 10.5L3.5 13L5 9L2 6H5.5L8 2Z" />
      </svg>
    ),
    skills: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L10 8L6 14M10 2L14 8L10 14" />
      </svg>
    ),
    marketplace: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 4h14M3 8h10M5 12h6" />
        <circle cx="13" cy="12" r="2" />
      </svg>
    ),
    governance: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1L14 5L14 11L8 15L2 11L2 5L8 1Z" />
        <path d="M8 5v6M5 8h6" />
      </svg>
    ),
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, width: 16, height: 16 }}>
      {iconMap[type]}
    </span>
  )
}