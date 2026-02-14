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
            <Link to="/ariel/debt-report" className="ariel-section-card">
              <span className="ariel-section-icon">📋</span>
              <h3 className="ariel-section-title">דוח חייבים לקוחות אריאל</h3>
              <p className="ariel-section-desc">דוח חייבים מסונן ללקוחות אריאל (חתך 102-1) — סניף 102</p>
              <span className="ariel-section-action">צפייה &larr;</span>
            </Link>

            <Link to="/ariel/uncharged-delivery" className="ariel-section-card">
              <span className="ariel-section-icon">🚚</span>
              <h3 className="ariel-section-title">תעודות משלוח שלא חויבו</h3>
              <p className="ariel-section-desc">תעודות משלוח פתוחות שטרם חויבו — סניף 102</p>
              <span className="ariel-section-action">צפייה &larr;</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
