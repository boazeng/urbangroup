import { Link } from 'react-router-dom'
import './MaintenancePage.css'

const sections = [
  {
    id: 'messages',
    title: 'הודעות WhatsApp',
    description: 'צפייה בכל ההודעות שהתקבלו מ-WhatsApp — טקסט, תמונות והודעות קוליות',
    icon: '💬',
    link: '/maintenance/messages',
  },
  {
    id: 'service-calls',
    title: 'קריאות שירות',
    description: 'ניהול קריאות שירות שזוהו על ידי המערכת — מעקב סטטוס וטיפול',
    icon: '🔧',
    link: '/maintenance/service-calls',
  },
  {
    id: 'bot-scripts',
    title: 'תסריטי בוט',
    description: 'עריכת תסריטי שיחה של הבוט — שלבים, כפתורים, טקסטים ופעולות סיום',
    icon: '🤖',
    link: '/maintenance/bot-scripts',
  },
  {
    id: 'bot-training',
    title: 'אימון הבוט',
    description: 'עריכת Prompt של ה-AI וצפייה בהיסטוריית שיחות לשיפור הבוט',
    icon: '🎓',
    link: '/maintenance/bot-training',
  },
  {
    id: 'bot-flow',
    title: 'עורך זרימה ויזואלי',
    description: 'בנה תסריטי בוט בגרירה — חבר צמתים ויצור ענפי שיחה בצורה ויזואלית',
    icon: '🗺️',
    link: '/maintenance/bot-flow',
  },
  {
    id: 'bot-diagnostics',
    title: 'אבחון בוט',
    description: 'מעקב אחר פעילות הבוט — צפייה בלוג שיחות, שלבים, החלטות ופעולות בזמן אמת',
    icon: '🔍',
    link: '/maintenance/bot-diagnostics',
  },
  {
    id: 'qr-generator',
    title: 'יצירת QR למכשירים',
    description: 'צור קוד QR לכל מכשיר — לקוח יסרוק ויפתח שיחת WhatsApp עם הבוט ומספר המכשיר מולא אוטומטית',
    icon: '📱',
    link: '/maintenance/qr-generator',
  },
]

export default function MaintenancePage() {
  return (
    <div className="mnt-page">
      <div className="container">
        <Link to="/" className="mnt-back">&rarr; חזרה לדף הבית</Link>

        <h1 className="mnt-title">ניהול פעולות אחזקה</h1>

        <section className="mnt-sections">
          <div className="mnt-sections-grid">
            {sections.map((sec) => (
              <Link key={sec.id} to={sec.link} className="mnt-section-card">
                <span className="mnt-section-icon">{sec.icon}</span>
                <h3 className="mnt-section-title">{sec.title}</h3>
                <p className="mnt-section-desc">{sec.description}</p>
                <span className="mnt-section-action">פתיחה &larr;</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
