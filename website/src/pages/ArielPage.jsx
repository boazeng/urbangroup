import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const BUCKET_LABELS = {
  current: 'שוטף',
  '30': '30 יום',
  '60': '60 יום',
  '90': '90 יום',
  '120plus': '120+ יום',
}

export default function ArielPage() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function generateReport() {
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const res = await fetch(`${API_BASE}/api/reports/aging`)
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

  function formatCurrency(num) {
    if (!num) return '-'
    return num.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/" className="ariel-back">&rarr; חזרה לדף הבית</Link>

        <h1 className="ariel-title">אריאל</h1>

        <section className="ariel-sections">
          <div className="ariel-sections-grid">
            <button
              className="ariel-section-card"
              onClick={generateReport}
              disabled={loading}
            >
              <span className="ariel-section-icon">📊</span>
              <h3 className="ariel-section-title">דוח גיול חובות</h3>
              <p className="ariel-section-desc">הפקת דוח גיול חובות מחשבוניות מרכזות בפריוריטי — פילוח לפי לקוח וגיל חוב</p>
              <span className="ariel-section-action">{loading ? 'מפיק דוח...' : 'הפקה'} &larr;</span>
            </button>
          </div>
        </section>

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
              <h2 className="ariel-report-title">דוח גיול חובות — חשבוניות מרכזות</h2>
              <span className="ariel-report-meta">
                {report.invoice_count} חשבוניות | {report.customers.length} לקוחות עם יתרה
              </span>
            </div>

            <div className="ariel-card">
              <table className="ariel-table">
                <thead>
                  <tr>
                    <th>מס׳ לקוח</th>
                    <th>שם לקוח</th>
                    <th className="ariel-num">{BUCKET_LABELS.current}</th>
                    <th className="ariel-num">{BUCKET_LABELS['30']}</th>
                    <th className="ariel-num">{BUCKET_LABELS['60']}</th>
                    <th className="ariel-num">{BUCKET_LABELS['90']}</th>
                    <th className="ariel-num">{BUCKET_LABELS['120plus']}</th>
                    <th className="ariel-num ariel-total-col">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.customers.map((cust) => (
                    <tr key={cust.custname}>
                      <td className="ariel-cell-cust">{cust.custname}</td>
                      <td>{cust.cdes}</td>
                      <td className="ariel-num">{formatCurrency(cust.current)}</td>
                      <td className="ariel-num">{formatCurrency(cust['30'])}</td>
                      <td className="ariel-num">{formatCurrency(cust['60'])}</td>
                      <td className="ariel-num">{formatCurrency(cust['90'])}</td>
                      <td className={`ariel-num ${cust['120plus'] > 0 ? 'ariel-overdue' : ''}`}>
                        {formatCurrency(cust['120plus'])}
                      </td>
                      <td className="ariel-num ariel-total-col">{formatCurrency(cust.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="ariel-totals-row">
                    <td></td>
                    <td className="ariel-totals-label">סה״כ</td>
                    <td className="ariel-num">{formatCurrency(report.totals.current)}</td>
                    <td className="ariel-num">{formatCurrency(report.totals['30'])}</td>
                    <td className="ariel-num">{formatCurrency(report.totals['60'])}</td>
                    <td className="ariel-num">{formatCurrency(report.totals['90'])}</td>
                    <td className="ariel-num">{formatCurrency(report.totals['120plus'])}</td>
                    <td className="ariel-num ariel-total-col">{formatCurrency(report.totals.total)}</td>
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
