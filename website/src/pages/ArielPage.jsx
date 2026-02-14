import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function ArielPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/" className="ariel-back">&rarr; חזרה לדף הבית</Link>

        <h1 className="ariel-title">אריאל</h1>

        <section className="ariel-sections">
          <div className="ariel-sections-grid">
            <Link to="/ariel/aging-report" className="ariel-section-card">
              <span className="ariel-section-icon">📊</span>
              <h3 className="ariel-section-title">דוח גיול חובות</h3>
              <p className="ariel-section-desc">הפקת דוח גיול חובות מחשבוניות מרכזות בפריוריטי — פילוח לפי לקוח וגיל חוב</p>
              <span className="ariel-section-action">צפייה &larr;</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
