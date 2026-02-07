import './Footer.css'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <h3 className="footer-logo">קבוצת אורבן</h3>
          <p className="footer-tagline">פתרונות חנייה וניהול מתקדמים</p>
        </div>
        <div className="footer-links">
          <h4>קישורים</h4>
          <a href="https://www.urbanparking.co.il/" target="_blank" rel="noopener noreferrer">
            אתר החברה
          </a>
          <a href="#apps">אפליקציות</a>
          <a href="#stats">אודות</a>
        </div>
        <div className="footer-links">
          <h4>צור קשר</h4>
          <span>info@urbanparking.co.il</span>
          <span>03-1234567</span>
          <span>ישראל</span>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <span>© {year} קבוצת אורבן — כל הזכויות שמורות</span>
        </div>
      </div>
    </footer>
  )
}
