import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'

const STATUSES = [
  { id: 'all', label: 'הכל', color: '#333' },
  { id: 'delivered', label: 'נמסרו', color: '#16a34a' },
  { id: 'in-progress', label: 'בביצוע', color: '#2563eb' },
  { id: 'quotes', label: 'מו"מ והצעות מחיר', color: '#d97706' },
  { id: 'cancelled', label: 'בוטלו', color: '#dc2626' },
]

export default function ParkingProjectsPage() {
  const [statusFilter, setStatusFilter] = useState('all')

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/parking" className="ariel-back">&rarr; חזרה לחניה</Link>
        <h1 className="ariel-title">ניהול פרויקטים — חניה</h1>

        {/* Status filter buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {STATUSES.map(s => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: statusFilter === s.id ? `2px solid ${s.color}` : '1px solid #ccc',
                background: statusFilter === s.id ? s.color : '#fff',
                color: statusFilter === s.id ? '#fff' : s.color,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: statusFilter === s.id ? 'bold' : 'normal',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Projects table placeholder */}
        <div style={{ color: '#888', fontSize: '16px', marginTop: '40px', textAlign: 'center' }}>
          {statusFilter === 'all' ? 'כל הפרויקטים' : STATUSES.find(s => s.id === statusFilter)?.label}
          <br />
          <span style={{ fontSize: '14px' }}>טבלת הפרויקטים תתווסף בהמשך</span>
        </div>
      </div>
    </div>
  )
}
