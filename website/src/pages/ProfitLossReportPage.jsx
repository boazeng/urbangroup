import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const fmtNum = (v) => {
  const n = Number(v)
  if (!n) return ''
  return n.toLocaleString('he-IL', { maximumFractionDigits: 2 })
}

const fmtDate = (iso) => {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`  // dd/mm/yy
}

export default function ProfitLossReportPage() {
  const [branch, setBranch] = useState('109')
  const [dateType, setDateType] = useState('FNCDATE')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accStatus, setAccStatus] = useState({ count: 0, updatedAt: '' })

  const loadAccStatus = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/reports/accounts-status`)
      const d = await r.json()
      if (d.ok) setAccStatus({ count: d.count || 0, updatedAt: d.updatedAt || '' })
    } catch {}
  }

  useEffect(() => { loadAccStatus() }, [])

  const runReport = async () => {
    setError('')
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/reports/profit-loss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, dateType, dateFrom, dateTo }),
      })
      const data = await resp.json()
      if (data.ok) {
        setRows(data.rows || [])
      } else {
        setError(data.error || 'שגיאה בהפקת הדוח')
      }
    } catch (e) {
      setError(`שגיאה: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Group rows by account for summary
  const accountSummary = {}
  for (const r of rows) {
    if (!accountSummary[r.account]) {
      accountSummary[r.account] = {
        category: r.category,
        trialCode: r.trialCode,
        trialSection: r.trialSection,
        desc: r.accountDesc,
        debit: 0, credit: 0, count: 0,
      }
    }
    accountSummary[r.account].debit += r.debit
    accountSummary[r.account].credit += r.credit
    accountSummary[r.account].count += 1
  }

  // Filter and group by category
  const sortByTrialThenAcc = ([accA, sa], [accB, sb]) => {
    const cmp = (sa.trialCode || '').localeCompare(sb.trialCode || '')
    if (cmp !== 0) return cmp
    return accA.localeCompare(accB)
  }
  const revenueAccounts = Object.entries(accountSummary)
    .filter(([_, s]) => s.category === 'תקבולים')
    .sort(([a], [b]) => a.localeCompare(b))
  const expenseAccounts = Object.entries(accountSummary)
    .filter(([_, s]) => s.category === 'הוצאות')
    .sort(sortByTrialThenAcc)
  const loanAccounts = Object.entries(accountSummary)
    .filter(([_, s]) => s.category === 'הלוואות')
    .sort(sortByTrialThenAcc)
  const relatedAccounts = Object.entries(accountSummary)
    .filter(([_, s]) => s.category === 'חברות קשורות')
    .sort(sortByTrialThenAcc)

  const totalRevenue = revenueAccounts.reduce((sum, [_, s]) => sum + (s.credit - s.debit), 0)
  const totalExpense = expenseAccounts.reduce((sum, [_, s]) => sum + (s.debit - s.credit), 0)

  const renderGroup = (title, accounts, color, isRevenue) => (
    <div style={{ marginBottom: '16px' }}>
      <h4 style={{ fontSize: '14px', color: '#fff', background: color, margin: '0 0 0', padding: '6px 12px', borderRadius: '6px 6px 0 0' }}>
        {title} ({accounts.length} חשבונות)
      </h4>
      <table className="ariel-table" style={{ fontSize: '12px', borderCollapse: 'collapse', border: `1px solid ${color}`, width: 'auto' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '6px 10px', border: '1px solid #ddd' }}>סעיף למאזן בוחן</th>
            <th style={{ padding: '6px 10px', border: '1px solid #ddd' }}>חשבון</th>
            <th style={{ padding: '6px 10px', border: '1px solid #ddd' }}>תאור</th>
            <th style={{ padding: '6px 10px', border: '1px solid #ddd' }}>חובה</th>
            <th style={{ padding: '6px 10px', border: '1px solid #ddd' }}>זכות</th>
            <th style={{ padding: '6px 10px', border: '1px solid #ddd' }}>סה"כ</th>
            <th style={{ padding: '6px 10px', border: '1px solid #ddd' }}>תנועות</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(([acc, s]) => {
            const total = isRevenue ? (s.credit - s.debit) : (s.debit - s.credit)
            return (
              <tr key={acc}>
                <td style={{ padding: '4px 10px', border: '1px solid #ddd', fontSize: '11px' }}>{s.trialSection}</td>
                <td style={{ padding: '4px 10px', border: '1px solid #ddd', fontWeight: 'bold' }}>{acc}</td>
                <td style={{ padding: '4px 10px', border: '1px solid #ddd' }}>{s.desc}</td>
                <td style={{ padding: '4px 10px', border: '1px solid #ddd', textAlign: 'left', direction: 'ltr' }}>{fmtNum(s.debit)}</td>
                <td style={{ padding: '4px 10px', border: '1px solid #ddd', textAlign: 'left', direction: 'ltr' }}>{fmtNum(s.credit)}</td>
                <td style={{ padding: '4px 10px', border: '1px solid #ddd', textAlign: 'left', direction: 'ltr', fontWeight: 'bold' }}>{fmtNum(total)}</td>
                <td style={{ padding: '4px 10px', border: '1px solid #ddd', textAlign: 'center' }}>{s.count}</td>
              </tr>
            )
          })}
          <tr style={{ background: '#f0fdf4', fontWeight: 'bold' }}>
            <td colSpan={5} style={{ padding: '6px 10px', border: '1px solid #ddd' }}>סה"כ {title}</td>
            <td style={{ padding: '6px 10px', border: '1px solid #ddd', textAlign: 'left', direction: 'ltr', color }}>
              {fmtNum(accounts.reduce((sum, [_, s]) => sum + (isRevenue ? s.credit - s.debit : s.debit - s.credit), 0))}
            </td>
            <td style={{ padding: '6px 10px', border: '1px solid #ddd', textAlign: 'center' }}>
              {accounts.reduce((sum, [_, s]) => sum + s.count, 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  const totals = rows.reduce(
    (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
    { debit: 0, credit: 0 }
  )

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/reports" className="ariel-back">&rarr; חזרה לדוחות</Link>
        <h1 className="ariel-title">דוח ניתוח תנועות - על פי מספר סניף</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>סניף</label>
            <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', width: '80px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>סוג תאריך</label>
            <select value={dateType} onChange={e => setDateType(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}>
              <option value="FNCDATE">תאריך ערך</option>
              <option value="BALDATE">תאריך למאזן</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>מתאריך</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>עד תאריך</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} />
          </div>
          <button onClick={runReport} disabled={loading}
            style={{ padding: '8px 24px', background: loading ? '#999' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'מפיק...' : 'הפק דוח'}
          </button>
          <button onClick={async () => {
            if (!confirm('סנכרן חשבונות מפריורטי? הפעולה תיקח כ-20 שניות.')) return
            setLoading(true)
            try {
              const r = await fetch(`${API_BASE}/api/reports/sync-accounts`, { method: 'POST' })
              const d = await r.json()
              if (d.ok) {
                alert(`סונכרנו ${d.count} חשבונות`)
                loadAccStatus()
              } else alert(`שגיאה: ${d.error}`)
            } finally { setLoading(false) }
          }} disabled={loading}
            style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: loading ? 'wait' : 'pointer' }}>
            🔄 סנכרן חשבונות
          </button>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {accStatus.updatedAt
              ? `סנכרון אחרון: ${fmtDate(accStatus.updatedAt)} | ${accStatus.count.toLocaleString('he-IL')} חשבונות`
              : 'לא בוצע סנכרון'}
          </span>
        </div>

        {error && (
          <div style={{ background: '#fee', color: '#c00', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>{error}</div>
        )}

        {rows.length > 0 && (
          <>
            {/* Summary: Revenue and Expenses */}
            <h3 style={{ fontSize: '16px', color: '#1e3a5f', marginTop: '20px', marginBottom: '12px' }}>דוח רווח והפסד</h3>
            {renderGroup('תקבולים', revenueAccounts, '#16a34a', true)}
            {renderGroup('הוצאות', expenseAccounts, '#dc2626', false)}
            <div style={{ display: 'inline-block', padding: '10px 20px', background: totalRevenue - totalExpense >= 0 ? '#dcfce7' : '#fee2e2', border: `2px solid ${totalRevenue - totalExpense >= 0 ? '#16a34a' : '#dc2626'}`, borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '15px' }}>
              {totalRevenue - totalExpense >= 0 ? '🟢 רווח' : '🔴 הפסד'}: {fmtNum(Math.abs(totalRevenue - totalExpense))} ₪
            </div>

            {loanAccounts.length > 0 && (
              <>
                <h3 style={{ fontSize: '16px', color: '#1e3a5f', marginTop: '20px', marginBottom: '12px' }}>הלוואות</h3>
                {renderGroup('הלוואות', loanAccounts, '#7c3aed', false)}
              </>
            )}

            {relatedAccounts.length > 0 && (
              <>
                <h3 style={{ fontSize: '16px', color: '#1e3a5f', marginTop: '20px', marginBottom: '12px' }}>חברות קשורות</h3>
                {renderGroup('חברות קשורות', relatedAccounts, '#0891b2', false)}
              </>
            )}

            {/* Detailed transactions */}
            <h3 style={{ fontSize: '15px', color: '#1e3a5f', marginTop: '20px', marginBottom: '8px' }}>פירוט תנועות ({rows.length})</h3>
            <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
              <table className="ariel-table" style={{ fontSize: '12px', borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#1e3a5f', color: '#fff', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '6px 8px' }}>סעיף למאזן בוחן</th>
                    <th style={{ padding: '6px 8px' }}>תאריך ערך</th>
                    <th style={{ padding: '6px 8px' }}>תאריך מאזן</th>
                    <th style={{ padding: '6px 8px' }}>מס תנועה</th>
                    <th style={{ padding: '6px 8px' }}>חשבון</th>
                    <th style={{ padding: '6px 8px' }}>פרטים</th>
                    <th style={{ padding: '6px 8px' }}>חשבון נגדי</th>
                    <th style={{ padding: '6px 8px' }}>תאור נגדי</th>
                    <th style={{ padding: '6px 8px' }}>חובה</th>
                    <th style={{ padding: '6px 8px' }}>זכות</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 ? '#f9fafb' : '#fff' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 'bold', color: r.category === 'רווח' ? '#16a34a' : r.category === 'הוצאות' ? '#dc2626' : '#6b7280', textAlign: 'center' }}>{r.trialSection}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtDate(r.fncDate)}</td>
                      <td style={{ padding: '4px 8px' }}>{fmtDate(r.balDate)}</td>
                      <td style={{ padding: '4px 8px' }}>{r.fncnum}</td>
                      <td style={{ padding: '4px 8px', fontWeight: 'bold' }}>{r.account}</td>
                      <td style={{ padding: '4px 8px' }}>{r.details}</td>
                      <td style={{ padding: '4px 8px' }}>{r.oppAccount}</td>
                      <td style={{ padding: '4px 8px' }}>{r.oppAccountDesc}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'left', direction: 'ltr' }}>{fmtNum(r.debit)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'left', direction: 'ltr' }}>{fmtNum(r.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
