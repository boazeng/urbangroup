import { Link } from 'react-router-dom'
import './UrbanEnergyPage.css'

const services = [
  {
    id: 'invoices',
    title: 'הפקת חשבוניות לקוח',
    description: 'הפקת חשבוניות עמלת גבייה ללקוחות אנרגיה אורבנית דרך מערכת פריוריטי',
    icon: '📄',
    link: '/app/urban-energy/invoices',
  },
]

export default function UrbanEnergyPage() {
  return (
    <div className="ue-page">
      <div className="container">
        <div className="ue-header">
          <Link to="/" className="ue-back">← חזרה לדף הבית</Link>
          <div className="ue-title-row">
            <span className="ue-logo-icon">⚡</span>
            <div>
              <h1 className="ue-title">אנרגיה אורבנית</h1>
              <p className="ue-subtitle">ניהול פעילות אנרגיה — חשבוניות, לקוחות ודוחות</p>
            </div>
          </div>
        </div>

        <section className="ue-services">
          <h2 className="ue-section-title">שירותים</h2>
          <div className="ue-services-grid">
            {services.map((svc) => (
              <Link key={svc.id} to={svc.link} className="ue-service-card">
                <span className="ue-service-icon">{svc.icon}</span>
                <h3 className="ue-service-title">{svc.title}</h3>
                <p className="ue-service-desc">{svc.description}</p>
                <span className="ue-service-action">פתיחה ←</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
