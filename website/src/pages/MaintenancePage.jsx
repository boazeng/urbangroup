import { Link } from 'react-router-dom'
import './MaintenancePage.css'

const sections = [
  {
    id: 'messages',
    title: 'הודעות נכנסות',
    description: 'צפייה בכל ההודעות שהתקבלו מ-WhatsApp — טקסט, תמונות והודעות קוליות',
    icon: '💬',
    link: '/maintenance/messages',
  },
  {
    id: 'service-calls',
    title: 'קריאות שירות',
    description: 'ניהול קריאות שירות שזוהו על ידי המערכת — מעקב סטטוס וטיפול',
    icon: '🔧',
    link: '/maintenance/service-calls',
  },
]

export default function MaintenancePage() {
  return (
    <div className="mnt-page">
      <div className="container">
        <Link to="/" className="mnt-back">&rarr; חזרה לדף הבית</Link>

        <div className="mnt-dash-header">
          <span className="mnt-dash-icon">🏗️</span>
          <div>
            <h1 className="mnt-title">אחזקה</h1>
            <p className="mnt-subtitle">ניהול תחזוקת מבנים — הודעות, קריאות שירות ומעקב</p>
          </div>
        </div>

        <section className="mnt-sections">
          <div className="mnt-sections-grid">
            {sections.map((sec) => (
              <Link key={sec.id} to={sec.link} className="mnt-section-card">
                <span className="mnt-section-icon">{sec.icon}</span>
                <h3 className="mnt-section-title">{sec.title}</h3>
                <p className="mnt-section-desc">{sec.description}</p>
                <span className="mnt-section-action">פתיחה &larr;</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
