import { Link, useLocation } from 'react-router-dom'
import logo from '../assets/logo.svg'
import './Header.css'

const navItems = [
  { path: '/', label: 'דף הבית' },
  { path: '/apps', label: 'אפליקציות' },
  { path: '/reports', label: 'דוחות' },
  { path: '/settings', label: 'הגדרות' },
]

export default function Header() {
  const location = useLocation()

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="header-logo">
          <img src={logo} alt="קבוצת אורבן" />
        </Link>
        <nav className="header-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`header-nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-user">
          <div className="header-user-avatar">מנ</div>
          <span className="header-user-name">מנהל מערכת</span>
        </div>
      </div>
    </header>
  )
}
