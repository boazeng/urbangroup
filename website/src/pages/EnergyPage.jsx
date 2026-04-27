import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function EnergyPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/" className="ariel-back">&rarr; חזרה לדף הבית</Link>

        <h1 className="ariel-title">אנרגיה</h1>

        <section className="ariel-sections">
          <div className="ariel-sections-grid">
            <Link to="/energy/invoices" className="ariel-section-card">
              <span className="ariel-section-icon">📄</span>
              <h3 className="ariel-section-title">הפקת חשבוניות לקוח</h3>
              <p className="ariel-section-desc">הפקת חשבוניות עמלת גבייה ללקוחות אנרגיה אורבנית דרך מערכת פריוריטי</p>
              <span className="ariel-section-action">פתיחה &larr;</span>
            </Link>

            <Link to="/energy/system" className="ariel-section-card">
              <span className="ariel-section-icon">⚡</span>
              <h3 className="ariel-section-title">ניהול מערכת חשמל</h3>
              <p className="ariel-section-desc">ניהול נתוני טעינה לרכבים חשמליים וניטור מטענים</p>
              <span className="ariel-section-action">פתיחה &larr;</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
