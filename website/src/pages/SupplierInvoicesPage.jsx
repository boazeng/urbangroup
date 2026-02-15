import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function SupplierInvoicesPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/apps" className="ariel-back">&rarr; חזרה לאפליקציות</Link>

        <h1 className="ariel-title">קליטת חשבוניות ספק</h1>
      </div>
    </div>
  )
}
