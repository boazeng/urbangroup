import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function ArielHRPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>

        <h1 className="ariel-title">ניהול כ&quot;א</h1>
        <p className="ariel-subtitle">ניהול הצבות באתרים — מאסטר</p>

      </div>
    </div>
  )
}
