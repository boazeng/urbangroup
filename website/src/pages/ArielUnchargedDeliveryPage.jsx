import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

export default function ArielUnchargedDeliveryPage() {
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
        const res = await fetch(`${API_BASE}/api/reports/ariel-uncharged-delivery?env=${env}`)
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

        <h1 className="ariel-title">תעודות משלוח שלא חויבו</h1>

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
                סניף 102 | {report.document_count} תעודות משלוח שלא חויבו | סה״כ {formatCurrency(report.total_amount)} ₪
              </span>
            </div>

            <div className="ariel-card">
              <table className="ariel-table">
                <thead>
                  <tr>
                    <th>מס׳ תעודה</th>
                    <th>מס׳ לקוח</th>
                    <th>שם לקוח</th>
                    <th>תאריך</th>
                    <th className="ariel-num">סכום</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {report.documents.map((doc) => (
                    <tr key={doc.docno}>
                      <td className="ariel-cell-cust">{doc.docno}</td>
                      <td>{doc.custname}</td>
                      <td>{doc.cdes}</td>
                      <td>{doc.curdate}</td>
                      <td className="ariel-num">{formatCurrency(doc.totprice)}</td>
                      <td>{doc.statdes}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="ariel-totals-row">
                    <td></td>
                    <td></td>
                    <td className="ariel-totals-label">סה״כ</td>
                    <td></td>
                    <td className="ariel-num">{formatCurrency(report.total_amount)}</td>
                    <td></td>
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
