'use client'

export interface Column<T> {
  key: string
  label: string
  width?: number | string
  align?: 'left' | 'center' | 'right'
  render?: (row: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T, index: number) => string | number
  emptyText?: string
  loading?: boolean
}

export default function DataTable<T>({ columns, data, rowKey, emptyText = 'ไม่มีข้อมูล', loading = false }: DataTableProps<T>) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  padding: '10px 14px', fontWeight: 600, color: '#64748b',
                  textAlign: col.align ?? 'left', width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                <span className="material-icons-round" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>refresh</span>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                {emptyText}
              </td>
            </tr>
          ) : data.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              style={{
                borderBottom: i < data.length - 1 ? '1px solid #f1f5f9' : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  style={{
                    padding: '10px 14px', color: '#334155',
                    textAlign: col.align ?? 'left',
                  }}
                >
                  {col.render ? col.render(row, i) : String((row as any)[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
