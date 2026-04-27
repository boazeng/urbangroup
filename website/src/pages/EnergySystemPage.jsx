import { Link } from 'react-router-dom'
import './ArielPage.css'

export default function EnergySystemPage() {
  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/energy" className="ariel-back">&rarr; חזרה לאנרגיה</Link>
        <h1 className="ariel-title">ניהול מערכת חשמל</h1>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>ניהול נתוני טעינה לרכבים חשמליים</p>

        <div style={{ color: '#888', fontSize: '15px', marginTop: '40px', textAlign: 'center', padding: '40px', border: '2px dashed #ccc', borderRadius: '8px' }}>
          העמוד יתווסף בהמשך — נטפל בנתונים שתוריד מהאפליקציה
        </div>
      </div>
    </div>
  )
}
