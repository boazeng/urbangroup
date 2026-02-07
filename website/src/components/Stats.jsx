import './Stats.css'

const stats = [
  { value: '25+', label: 'חניונים פעילים', icon: '🏗️' },
  { value: '350+', label: 'עובדים בקבוצה', icon: '👷' },
  { value: '10,000+', label: 'לקוחות פעילים', icon: '🤝' },
  { value: '15+', label: 'שנות ניסיון', icon: '📅' },
]

export default function Stats() {
  return (
    <section className="stats" id="stats">
      <div className="container">
        <h2 className="section-title">הקבוצה במספרים</h2>
        <p className="section-subtitle">קבוצת אורבן — מובילה בתחום החנייה והניהול בישראל</p>
        <div className="stats-grid">
          {stats.map((stat, i) => (
            <div key={i} className="stat-item">
              <span className="stat-icon">{stat.icon}</span>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
