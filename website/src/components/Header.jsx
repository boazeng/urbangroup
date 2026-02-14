import { Link, useLocation } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import logo from '../assets/logo.svg'
import './Header.css'

const navItems = [
  { path: '/', label: 'דף הבית' },
  { path: '/maintenance', label: 'אחזקה' },
  { path: '/ariel', label: 'אריאל' },
  { path: '/apps', label: 'אפליקציות' },
  { path: '/reports', label: 'דוחות' },
  { path: '/settings', label: 'הגדרות' },
]

export default function Header() {
  const location = useLocation()
  const { env, setEnv } = useEnv()
  const isDemo = env === 'demo'

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="header-logo">
          <img src={logo} alt="Urban Group" />
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
          <div className="header-env-toggle">
            <button
              className={`header-env-btn ${isDemo ? 'active' : ''}`}
              onClick={() => setEnv('demo')}
            >
              דמו
            </button>
            <button
              className={`header-env-btn ${!isDemo ? 'active' : ''}`}
              onClick={() => setEnv('real')}
            >
              אמיתי
            </button>
          </div>
          <div className="header-user-avatar">מנ</div>
          <span className="header-user-name">מנהל מערכת</span>
        </div>
      </div>
    </header>
  )
}
