import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const DAY_OPTIONS = [30, 60, 90]

export default function ArielInvoicesPage() {
  const { env } = useEnv()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [daysBack, setDaysBack] = useState(30)
  const [expandedCustomers, setExpandedCustomers] = useState(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    setReport(null)
    async function fetchReport() {
      try {
        const res = await fetch(`${API_BASE}/api/reports/ariel-invoices?env=${env}&days_back=${daysBack}`)
        const data = await res.json()
        if (data.ok) {
          setReport(data)
          setExpandedCustomers(new Set())
        } else {
          setError(data.error || 'שגיאה בהפקת הדוח')
        }
      } catch (e) {
        setError('לא ניתן להתחבר לשרת')
      }
      setLoading(false)
    }
    fetchReport()
  }, [env, daysBack])

  function formatCurrency(num) {
    if (!num) return '-'
    return num.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  function toggleCustomer(custname) {
    setExpandedCustomers(prev => {
      const next = new Set(prev)
      if (next.has(custname)) {
        next.delete(custname)
      } else {
        next.add(custname)
      }
      return next
    })
  }

  function expandAll() {
    if (!report) return
    setExpandedCustomers(new Set(report.customers.map(c => c.custname)))
  }

  function collapseAll() {
    setExpandedCustomers(new Set())
  }

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>

        <h1 className="ariel-title">חשבוניות מרכזות — אריאל</h1>

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
                <button className="ariel-filter-btn" onClick={expandAll}>פתח הכל</button>
                <button className="ariel-filter-btn" onClick={collapseAll}>סגור הכל</button>
              </div>
            </div>

            <div className="ariel-report-header">
              <span className="ariel-report-meta">
                סניף 102 | {report.customer_count} לקוחות | {report.total_invoices} חשבוניות | סה״כ {formatCurrency(report.total_amount)} ₪
              </span>
              <button className="ariel-print-btn" onClick={() => window.print()}>
                הדפסה
              </button>
            </div>

            <div className="ariel-card">
              <table className="ariel-table">
                <thead>
                  <tr>
                    <th style={{width: '30px'}}></th>
                    <th>מס׳ לקוח</th>
                    <th>שם לקוח</th>
                    <th>חשבוניות</th>
                    <th className="ariel-num">סה״כ</th>
                    <th style={{width: '50px', textAlign: 'center'}}>נספח</th>
                  </tr>
                </thead>
                <tbody>
                  {report.customers.map((cust) => (
                    <>
                      <tr
                        key={cust.custname}
                        className="ariel-expandable-row"
                        onClick={() => toggleCustomer(cust.custname)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{expandedCustomers.has(cust.custname) ? '▼' : '◀'}</td>
                        <td className="ariel-cell-cust">{cust.custname}</td>
                        <td>{cust.cdes}</td>
                        <td>{cust.invoices.length}</td>
                        <td className="ariel-num">{formatCurrency(cust.total)}</td>
                        <td></td>
                      </tr>
                      {expandedCustomers.has(cust.custname) && cust.invoices.map((inv) => (
                        <tr key={inv.ivnum} className="ariel-invoice-row">
                          <td></td>
                          <td className="ariel-cell-cust">{inv.ivnum}</td>
                          <td>{inv.codedes || inv.details}</td>
                          <td>{inv.ivdate}</td>
                          <td className="ariel-num">{formatCurrency(inv.totprice)}</td>
                          <td style={{textAlign: 'center'}}>{inv.has_attachment ? '✓' : ''}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="ariel-totals-row">
                    <td></td>
                    <td></td>
                    <td className="ariel-totals-label">סה״כ</td>
                    <td>{report.total_invoices}</td>
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
