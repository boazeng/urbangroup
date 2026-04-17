import { Link } from 'react-router-dom'
import './ArielPage.css'

const categories = [
  {
    id: 'delivered',
    title: 'פרויקטים שנמסרו',
    icon: '✅',
    color: '#16a34a',
    description: 'פרויקטים שהושלמו ונמסרו ללקוח',
  },
  {
    id: 'in-progress',
    title: 'פרויקטים בביצוע',
    icon: '🔨',
    color: '#2563eb',
    description: 'פרויקטים בשלבי ביצוע והתקנה',
  },
  {
    id: 'quotes',
    title: 'פרויקטים במו"מ והצעות מחיר',
    icon: '📋',
    color: '#d97706',
    description: 'הצעות מחיר פעילות ומשא ומתן',
  },
  {
    id: 'cancelled',
    title: 'פרויקטים שבוטלו',
    icon: '❌',
    color: '#dc2626',
    description: 'פרויקטים שבוטלו או לא יצאו לפועל',
  },
]

export default function ParkingPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/" className="ariel-back">&rarr; חזרה לדף הבית</Link>
        <h1 className="ariel-title">חניה — ניהול פרויקטים</h1>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>ניהול מכירות והתקנות של מתקני חניה</p>

        <div className="ariel-grid">
          {categories.map(cat => (
            <Link
              key={cat.id}
              to={`/parking/${cat.id}`}
              className="ariel-card"
              style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', borderRight: `4px solid ${cat.color}` }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{cat.icon}</div>
              <h3 style={{ margin: '0 0 4px', color: cat.color }}>{cat.title}</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{cat.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
