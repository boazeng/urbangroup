import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

export default function ArielDebtReportPage() {
  const { env } = useEnv()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setReport(null)
    async function fetchReport() {
      try {
        const res = await fetch(`${API_BASE}/api/reports/ariel-debt?env=${env}`)
        const data = await res.json()
        if (data.ok) {
          setReport(data)
        } else {
          setError(data.error || 'שגיאה בהפקת הדוח')
        }
      } catch (e) {
        setError('לא ניתן להתחבר לשרת')
      }
      setLoading(false)
    }
    fetchReport()
  }, [env])

  function formatCurrency(num) {
    if (!num) return '-'
    return num.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>

        <h1 className="ariel-title">דוח חייבים לקוחות אריאל</h1>

        {error && <div className="ariel-error">{error}</div>}

        {loading && (
          <div className="ariel-loading">
            <div className="ariel-spinner"></div>
            <span>טוען נתונים מפריוריטי...</span>
          </div>
        )}

        {report && (
          <div className="ariel-report">
            <div className="ariel-report-header">
              <span className="ariel-report-meta">
                חתך 102-1 | {report.ariel_customer_count} חשבונות בחתך | {report.filtered_customer_count} לקוחות עם יתרה
              </span>
              <button className="ariel-print-btn" onClick={() => window.print()}>
                הדפסה
              </button>
            </div>

            <div className="ariel-card">
              <table className="ariel-table">
                <thead>
                  <tr>
                    <th>מס׳ לקוח</th>
                    <th>שם לקוח</th>
                    <th className="ariel-num">יתרה</th>
                  </tr>
                </thead>
                <tbody>
                  {report.customers.map((cust) => (
                    <tr key={cust.custname}>
                      <td className="ariel-cell-cust">{cust.custname}</td>
                      <td>{cust.cdes}</td>
                      <td className="ariel-num">{formatCurrency(cust.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="ariel-totals-row">
                    <td></td>
                    <td className="ariel-totals-label">סה״כ</td>
                    <td className="ariel-num">{formatCurrency(report.total_balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
