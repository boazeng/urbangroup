import { Link } from 'react-router-dom'
import './AppCards.css'

const apps = [
  {
    id: 'customers',
    title: 'ניהול לקוחות',
    description: 'צפייה וניהול מאגר הלקוחות, פרטי התקשרות ומעקב',
    icon: '👥',
    color: '#4A90D9',
    ready: false,
  },
  {
    id: 'invoices',
    title: 'ניהול חשבוניות',
    description: 'הפקה ומעקב חשבוניות מס, קבלות ומסמכים פיננסיים',
    icon: '📄',
    color: '#38A169',
    ready: false,
  },
  {
    id: 'reports',
    title: 'דוחות ובקרה',
    description: 'דוחות ביצועים, ניתוח נתונים ובקרת תפעול',
    icon: '📊',
    color: '#9F7AEA',
    ready: false,
  },
  {
    id: 'parking',
    title: 'ניהול חניונים',
    description: 'מעקב תפוסה, תחזוקה וניהול שוטף של חניונים',
    icon: '🅿️',
    color: '#E53E3E',
    ready: false,
  },
  {
    id: 'hr',
    title: 'ניהול כוח אדם',
    description: 'ניהול עובדים, משמרות, נוכחות ומשאבי אנוש',
    icon: '🏢',
    color: '#DD6B20',
    ready: false,
  },
  {
    id: 'settings',
    title: 'הגדרות מערכת',
    description: 'הגדרות כלליות, הרשאות משתמשים וקונפיגורציה',
    icon: '⚙️',
    color: '#718096',
    ready: false,
  },
]

export default function AppCards() {
  return (
    <section className="app-cards" id="apps">
      <div className="container">
        <h2 className="section-title">אפליקציות פנימיות</h2>
        <p className="section-subtitle">גישה מהירה לכלי הניהול של הקבוצה</p>
        <div className="app-cards-grid">
          {apps.map((app) => (
            <Link
              key={app.id}
              to={app.ready ? `/app/${app.id}` : '#'}
              className={`app-card ${!app.ready ? 'app-card-disabled' : ''}`}
              onClick={(e) => !app.ready && e.preventDefault()}
            >
              <div className="app-card-icon" style={{ background: `${app.color}15` }}>
                <span>{app.icon}</span>
              </div>
              <h3 className="app-card-title">{app.title}</h3>
              <p className="app-card-desc">{app.description}</p>
              {!app.ready && <span className="app-card-badge">בקרוב</span>}
              <div className="app-card-accent" style={{ background: app.color }} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
