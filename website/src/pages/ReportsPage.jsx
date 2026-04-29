import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function ReportsPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/" className="ariel-back">&rarr; חזרה לדף הבית</Link>
        <h1 className="ariel-title">דוחות</h1>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>דוחות מערכת</p>

        <section className="ariel-sections">
          <div className="ariel-sections-grid">
            <Link to="/reports/profit-loss" className="ariel-section-card">
              <span className="ariel-section-icon">📊</span>
              <h3 className="ariel-section-title">דוח רווח והפסד</h3>
              <p className="ariel-section-desc">דוח תנועות לחשבונות לפי סניף ותאריכים</p>
              <span className="ariel-section-action">פתיחה &larr;</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
