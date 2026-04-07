'use client'

interface MarketplaceFilterProps {
  active: string
  onChange: (filter: string) => void
}

const FILTERS = ['All', 'Ingest', 'Process', 'Distill']

export function MarketplaceFilter({ active, onChange }: MarketplaceFilterProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      {FILTERS.map(filter => (
        <button
          key={filter}
          onClick={() => onChange(filter)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid',
            borderColor: active === filter ? '#4f46e5' : '#e5e7eb',
            background: active === filter ? '#4f46e5' : '#ffffff',
            color: active === filter ? '#ffffff' : '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {filter}
        </button>
      ))}
    </div>
  )
}