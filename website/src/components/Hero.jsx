import './Hero.css'

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero-content">
        <h1 className="hero-title">פורטל ניהול קבוצת אורבנית</h1>
        <p className="hero-subtitle">
          מערכת ניהול מרכזית לקבוצת החברות — גישה מהירה לכל הכלים והאפליקציות הפנימיות
        </p>
        <div className="hero-actions">
          <a href="#apps" className="hero-btn hero-btn-primary">
            כניסה לאפליקציות
          </a>
          <a href="#stats" className="hero-btn hero-btn-secondary">
            סקירה כללית
          </a>
        </div>
      </div>
    </section>
  )
}
