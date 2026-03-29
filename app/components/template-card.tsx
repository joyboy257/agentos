'use client'

export function TemplateCard({ name, agents, onClick }: TemplateCardProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-hover)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Template name */}
      <div
        style={{
          fontWeight: 700,
          fontSize: '14px',
          marginBottom: '16px',
          color: 'var(--text-primary)',
        }}
      >
        {name}
      </div>

      {/* Animated workflow preview */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '16px',
          height: '40px',
        }}
      >
        {agents.map((agent, index) => (
          <div key={agent} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Agent circle */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: index === 0 ? 'var(--agent-reader)' :
                  index === agents.length - 1 ? 'var(--agent-sender)' : 'var(--agent-drafter)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: '#fff',
                animation: 'fadeIn 0.3s ease forwards',
                animationDelay: `${index * 0.1}s`,
                opacity: 0,
              }}
            />
            {/* Arrow */}
            {index < agents.length - 1 && (
              <div
                style={{
                  width: '20px',
                  height: '2px',
                  backgroundColor: 'var(--border-hover)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    right: '-2px',
                    top: '-3px',
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid var(--border-hover)',
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Use this button */}
      <button
        style={{
          width: '100%',
          padding: '8px 12px',
          backgroundColor: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.9'
          e.currentTarget.style.transform = 'scale(1.02)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1'
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        Use this
      </button>
    </div>
  )
}

export interface TemplateCardProps {
  name: string
  agents: string[]
  onClick: () => void
}
