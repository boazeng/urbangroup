import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function ParkingPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/" className="ariel-back">&rarr; חזרה לדף הבית</Link>

        <h1 className="ariel-title">חניה</h1>

        <section className="ariel-sections">
          <div className="ariel-sections-grid">
            <Link to="/parking/projects" className="ariel-section-card">
              <span className="ariel-section-icon">🅿️</span>
              <h3 className="ariel-section-title">ניהול פרויקטים</h3>
              <p className="ariel-section-desc">ניהול מכירות והתקנות של מתקני חניה</p>
              <span className="ariel-section-action">צפייה &larr;</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
