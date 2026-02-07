import { useParams, Link } from 'react-router-dom'

const appNames = {
  customers: 'ניהול לקוחות',
  invoices: 'ניהול חשבוניות',
  reports: 'דוחות ובקרה',
  parking: 'ניהול חניונים',
  hr: 'ניהול כוח אדם',
  settings: 'הגדרות מערכת',
}

export default function AppPage() {
  const { appId } = useParams()
  const appName = appNames[appId] || 'אפליקציה'

  return (
    <div style={{
      minHeight: 'calc(100vh - var(--header-height))',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '2rem', color: 'var(--color-primary)', marginBottom: '16px' }}>
        {appName}
      </h1>
      <p style={{ color: 'var(--color-text-light)', marginBottom: '32px', maxWidth: '400px' }}>
        האפליקציה בפיתוח ותהיה זמינה בקרוב
      </p>
      <Link
        to="/"
        style={{
          padding: '12px 28px',
          background: 'var(--color-primary)',
          color: 'white',
          borderRadius: 'var(--radius-sm)',
          fontWeight: 600,
        }}
      >
        חזרה לדף הבית
      </Link>
    </div>
  )
}
