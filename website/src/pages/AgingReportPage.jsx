import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const BUCKET_LABELS = {
  current: 'שוטף',
  '30': '30 יום',
  '60': '60 יום',
  '90': '90 יום',
  '120plus': '120+ יום',
}

const BRANCH_OPTIONS = [
  { value: '', label: 'כל הסניפים' },
  { value: '108', label: 'אנרגיה (108)' },
  { value: '026', label: 'חניה (026)' },
  { value: '001', label: 'כללי (001)' },
]

export default function AgingReportPage() {
  const { env } = useEnv()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [branch, setBranch] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    setReport(null)
    async function fetchReport() {
      try {
        const branchParam = branch ? `&branch=${branch}` : ''
        const res = await fetch(`${API_BASE}/api/reports/aging?env=${env}${branchParam}`)
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
  }, [env, branch])

  function formatCurrency(num) {
    if (!num) return '-'
    return num.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>

        <h1 className="ariel-title">דוח גיול חובות — חשבוניות מרכזות</h1>

        <div className="ariel-filters">
          <label className="ariel-filter-label">סניף:</label>
          <div className="ariel-filter-btns">
            {BRANCH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`ariel-filter-btn ${branch === opt.value ? 'active' : ''}`}
                onClick={() => setBranch(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

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
