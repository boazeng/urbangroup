import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const DAY_OPTIONS = [30, 60, 90, 180]
const STATUS_OPTIONS = [
  { value: 'all', label: 'הכל' },
  { value: 'טיוטא', label: 'טיוטא' },
  { value: 'סופית', label: 'סופית' },
]

export default function ArielUnchargedDeliveryPage() {
  const { env } = useEnv()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [daysBack, setDaysBack] = useState(30)
  const [statusFilter, setStatusFilter] = useState('all')

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

  const filtered = useMemo(() => {
    if (!report) return { documents: [], total: 0 }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const docs = report.documents.filter((doc) => {
      if (doc.curdate < cutoffStr) return false
      if (statusFilter !== 'all' && doc.statdes !== statusFilter) return false
      return true
    })
    const total = docs.reduce((sum, d) => sum + d.totprice, 0)
    return { documents: docs, total }
  }, [report, daysBack, statusFilter])

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
            <div className="ariel-filters">
              <div className="ariel-filter-group">
                <span className="ariel-filter-label">תקופה:</span>
                <div className="ariel-filter-btns">
                  {DAY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      className={`ariel-filter-btn${daysBack === d ? ' active' : ''}`}
                      onClick={() => setDaysBack(d)}
                    >
                      {d} יום
                    </button>
                  ))}
                </div>
              </div>
              <div className="ariel-filter-group">
                <span className="ariel-filter-label">סטטוס:</span>
                <div className="ariel-filter-btns">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`ariel-filter-btn${statusFilter === opt.value ? ' active' : ''}`}
                      onClick={() => setStatusFilter(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="ariel-report-header">
              <span className="ariel-report-meta">
                סניף 102 | {filtered.documents.length} תעודות ({daysBack} יום אחרונים{statusFilter !== 'all' ? ` | ${statusFilter}` : ''}) | סה״כ {formatCurrency(filtered.total)} ₪
              </span>
            </div>

            <div className="ariel-card">
              <table className="ariel-table">
                <thead>
                  <tr>
                    <th>מס׳ תעודה</th>
                    <th>מס׳ לקוח</th>
                    <th>שם לקוח</th>
                    <th>שם אתר</th>
                    <th>פרטים</th>
                    <th>תאריך</th>
                    <th className="ariel-num">סכום</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.documents.map((doc) => (
                    <tr key={doc.docno}>
                      <td className="ariel-cell-cust">{doc.docno}</td>
                      <td>{doc.custname}</td>
                      <td>{doc.cdes}</td>
                      <td>{doc.codedes}</td>
                      <td>{doc.details}</td>
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
                    <td></td>
                    <td></td>
                    <td className="ariel-num">{formatCurrency(filtered.total)}</td>
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
