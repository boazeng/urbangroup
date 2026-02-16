import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function AppsPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/" className="ariel-back">&rarr; חזרה לדף הבית</Link>

        <h1 className="ariel-title">אפליקציות</h1>

        <section className="ariel-sections">
          <div className="ariel-sections-grid">
            <Link to="/apps/supplier-invoices" className="ariel-section-card">
              <span className="ariel-section-icon">📥</span>
              <h3 className="ariel-section-title">קליטת חשבוניות ספק</h3>
              <p className="ariel-section-desc">קליטת חשבוניות ספקים למערכת פריוריטי</p>
              <span className="ariel-section-action">פתיחה &larr;</span>
            </Link>
            <Link to="/apps/invoice-printer" className="ariel-section-card">
              <span className="ariel-section-icon">🖨️</span>
              <h3 className="ariel-section-title">הדפסת חשבוניות מס</h3>
              <p className="ariel-section-desc">הורדת חשבוניות מס מפריוריטי לפי מספר חשבונית</p>
              <span className="ariel-section-action">פתיחה &larr;</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
