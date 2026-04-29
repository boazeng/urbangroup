import { useState, useRef, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

// Columns to display (ordered)
const COLS = [
  { key: 'EVSE ID', label: 'מזהה עמדה', width: 90 },
  { key: 'EVSE NAME', label: 'שם משתמש', width: 130 },
  { key: 'PARTNER', label: 'אתר', width: 150 },
  { key: 'MEMBER NAME', label: 'שם חבר', width: 120 },
  { key: 'MEMBER NUMBER', label: 'טלפון', width: 110 },
  { key: '_PRIORITY_CUST', label: 'מס לקוח (פריוריטי)', width: 110 },
  { key: 'TOKEN TYPE', label: 'סוג', width: 70 },
  { key: 'CONSUMPTION (KWH)', label: 'kWh', width: 60, num: true },
  { key: 'CHARGING DURATION', label: 'משך טעינה', width: 80 },
  { key: 'AVG POWER', label: 'הספק ממוצע', width: 80, num: true },
  { key: 'ENERGY PRICE (WITH TAXES)', label: 'עלות חשמל', width: 80, num: true },
  { key: 'SERVICE FEE (WITH TAXES)', label: 'עלות שירות', width: 80, num: true },
  { key: 'AMOUNT (WITH TAXES)', label: 'סה"כ ₪', width: 75, num: true },
  { key: 'STARTED AT', label: 'התחלה', width: 140 },
  { key: 'ENDED AT', label: 'סיום', width: 140 },
]

const fmtNum = (v) => {
  const n = Number(v)
  if (!isFinite(n) || v === '' || v === null || v === undefined) return ''
  return n.toLocaleString('he-IL', { maximumFractionDigits: 2 })
}

export default function EnergySystemPage() {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [phoneToCust, setPhoneToCust] = useState({})  // phone → {custname, custdes}
  const [lookupBusy, setLookupBusy] = useState(false)
  const inputRef = useRef(null)

  const generateCommitteesReport = () => {
    if (!rows.length) return
    // Group by PARTNER (site name)
    const groups = {}
    for (const r of rows) {
      const key = (r['PARTNER'] || 'ללא אתר').trim()
      if (!groups[key]) groups[key] = []
      groups[key].push(r)
    }

    const sortedSites = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'he'))

    const calcTotals = (arr) => ({
      sessions: arr.length,
      kwh: arr.reduce((s, r) => s + (Number(r['CONSUMPTION (KWH)']) || 0), 0),
      energy: arr.reduce((s, r) => s + (Number(r['ENERGY PRICE (WITH TAXES)']) || 0), 0),
      service: arr.reduce((s, r) => s + (Number(r['SERVICE FEE (WITH TAXES)']) || 0), 0),
      idling: arr.reduce((s, r) => s + (Number(r['IDLING FEE (WITH TAXES)']) || 0), 0),
      amount: arr.reduce((s, r) => s + (Number(r['AMOUNT (WITH TAXES)']) || 0), 0),
    })

    const grand = calcTotals(rows)
    const fN = (n) => n.toLocaleString('he-IL', { maximumFractionDigits: 2 })

    // Build summary row per site for the top table
    const summaryRows = sortedSites.map(site => {
      const t = calcTotals(groups[site])
      return { site, ...t }
    })

    let html = `
      <div class="section">
        <h2>סיכום כל האתרים</h2>
        <table class="grid">
          <thead><tr>
            <th>אתר</th><th>סשנים</th><th>kWh</th><th>עלות חשמל</th><th>עלות שירות</th><th>השבתה</th><th>סה"כ ₪</th>
          </tr></thead>
          <tbody>
            ${summaryRows.map(r => `
              <tr>
                <td>${r.site}</td>
                <td class="num">${r.sessions}</td>
                <td class="num">${fN(r.kwh)}</td>
                <td class="num">${fN(r.energy)}</td>
                <td class="num">${fN(r.service)}</td>
                <td class="num">${fN(r.idling)}</td>
                <td class="num"><strong>${fN(r.amount)}</strong></td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td><strong>סה"כ כללי</strong></td>
              <td class="num"><strong>${grand.sessions}</strong></td>
              <td class="num"><strong>${fN(grand.kwh)}</strong></td>
              <td class="num"><strong>${fN(grand.energy)}</strong></td>
              <td class="num"><strong>${fN(grand.service)}</strong></td>
              <td class="num"><strong>${fN(grand.idling)}</strong></td>
              <td class="num"><strong>${fN(grand.amount)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    `

    // Per-site detail tables
    for (const site of sortedSites) {
      const arr = groups[site]
      const t = calcTotals(arr)
      html += `
        <div class="section">
          <h2>${site}</h2>
          <div class="site-meta">${t.sessions} סשנים · ${fN(t.kwh)} kWh · ${fN(t.amount)} ₪</div>
          <table class="grid">
            <thead><tr>
              <th>שם משתמש</th><th>טלפון</th><th>תאריך</th><th>kWh</th><th>משך</th><th>חשמל</th><th>שירות</th><th>סה"כ ₪</th>
            </tr></thead>
            <tbody>
              ${arr.map(r => `
                <tr>
                  <td>${r['EVSE NAME'] || ''}</td>
                  <td>${r['MEMBER NUMBER'] || ''}</td>
                  <td>${(r['STARTED AT'] || '').split(',')[0]}</td>
                  <td class="num">${fN(Number(r['CONSUMPTION (KWH)']) || 0)}</td>
                  <td>${r['CHARGING DURATION'] || ''}</td>
                  <td class="num">${fN(Number(r['ENERGY PRICE (WITH TAXES)']) || 0)}</td>
                  <td class="num">${fN(Number(r['SERVICE FEE (WITH TAXES)']) || 0)}</td>
                  <td class="num"><strong>${fN(Number(r['AMOUNT (WITH TAXES)']) || 0)}</strong></td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3"><strong>סה"כ ${site}</strong></td>
                <td class="num"><strong>${fN(t.kwh)}</strong></td>
                <td></td>
                <td class="num"><strong>${fN(t.energy)}</strong></td>
                <td class="num"><strong>${fN(t.service)}</strong></td>
                <td class="num"><strong>${fN(t.amount)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      `
    }

    const styles = `
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; color: #1a1a1a; padding: 20px; margin: 0; background: #fff; }
      .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 16px; }
      .header h1 { font-size: 24px; color: #1e3a5f; margin: 0 0 4px; }
      .header .subtitle { font-size: 13px; color: #6b7280; }
      .section { margin-bottom: 28px; page-break-inside: avoid; }
      .section h2 { font-size: 16px; color: #fff; margin: 0 0 8px; padding: 8px 14px; background: #2563eb; border-radius: 6px 6px 0 0; }
      .site-meta { font-size: 12px; color: #555; margin: 0 0 6px; padding: 4px 12px; background: #eff6ff; border-radius: 4px; }
      table.grid { width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #ccc; }
      table.grid th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: right; font-weight: 600; border: 1px solid #1e3a5f; }
      table.grid td { padding: 4px 8px; text-align: right; border: 1px solid #ddd; }
      table.grid tbody tr:nth-child(even) { background: #f9fafb; }
      .num { text-align: left; font-variant-numeric: tabular-nums; direction: ltr; }
      .total-row { background: #f0fdf4 !important; border-top: 2px solid #16a34a; }
      .total-row td { padding: 6px 8px; }
      .print-btn { position: fixed; top: 16px; left: 16px; padding: 10px 24px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
      .print-btn:hover { background: #1d4ed8; }
      @media print { .print-btn { display: none; } body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .section { page-break-inside: avoid; } }
    `

    const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>סיכום ועדים — דוח טעינות</title><style>${styles}</style></head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 הדפס / שמור PDF</button>
  <div class="header">
    <h1>סיכום ועדים — דוח טעינות חשמל</h1>
    <div class="subtitle">${fileName} | הופק: ${new Date().toLocaleDateString('he-IL')} | ${sortedSites.length} אתרים · ${grand.sessions} סשנים · ${fN(grand.amount)} ₪</div>
  </div>
  ${html}
</body>
</html>`

    const w = window.open('', '_blank')
    w.document.write(fullHtml)
    w.document.close()
  }

  const lookupCustomers = async () => {
    const phones = [...new Set(rows.map(r => r['MEMBER NUMBER']).filter(Boolean))]
    if (!phones.length) return
    setLookupBusy(true)
    try {
      const resp = await fetch(`${API_BASE}/api/energy/customers-by-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones }),
      })
      const data = await resp.json()
      if (data.ok) {
        setPhoneToCust(data.results || {})
        setError('')
      } else {
        setError(data.error || 'שגיאה בחיפוש לקוחות')
      }
    } catch (e) {
      setError(`שגיאה: ${e.message}`)
    } finally {
      setLookupBusy(false)
    }
  }

  const [savedAt, setSavedAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [month, setMonth] = useState('')
  const [availableMonths, setAvailableMonths] = useState([])
  const [custStatus, setCustStatus] = useState({ count: 0, updatedAt: '' })

  const loadCustStatus = () => {
    fetch(`${API_BASE}/api/energy/customers-status`)
      .then(r => r.json())
      .then(d => { if (d.ok) setCustStatus({ count: d.count || 0, updatedAt: d.updatedAt || '' }) })
      .catch(() => {})
  }
  useEffect(() => { loadCustStatus() }, [])

  // Load list of available months on mount
  const loadMonths = () => {
    fetch(`${API_BASE}/api/energy/charging-months`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.months) {
          setAvailableMonths(d.months)
          // Auto-select first month if none selected
          if (!month && d.months.length > 0) setMonth(d.months[0].month)
        }
      })
      .catch(() => {})
  }
  useEffect(() => { loadMonths() }, [])

  const skipNextLoadRef = useRef(false)

  // Load data when selected month changes (skipped right after fresh upload)
  useEffect(() => {
    if (!month) return
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false
      return
    }
    fetch(`${API_BASE}/api/energy/charging-sessions?month=${encodeURIComponent(month)}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setRows(d.rows || [])
          setFileName(d.fileName || '')
          setSavedAt(d.updatedAt || '')
        }
      })
      .catch(() => {})
  }, [month])

  // Auto-lookup customer numbers when rows change (using DB cache)
  useEffect(() => {
    if (rows.length === 0) return
    const phones = [...new Set(rows.map(r => r['MEMBER NUMBER']).filter(Boolean))]
    if (!phones.length) return
    fetch(`${API_BASE}/api/energy/customers-by-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones }),
    })
      .then(r => r.json())
      .then(d => { if (d.ok && d.results) { setPhoneToCust(d.results); setError('') } })
      .catch(() => {})
  }, [rows])

  const handleFile = async (file) => {
    setError('')
    if (!file) return
    const targetMonth = (prompt('הזן חודש לקובץ זה (פורמט M.YY, למשל 3.26):', month || '') || '').trim()
    if (!targetMonth) {
      setError('לא הוזן חודש - הקובץ לא נטען')
      return
    }
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
      // Set local state first - skip the useEffect refetch
      skipNextLoadRef.current = true
      setRows(json)
      setFileName(file.name)
      setMonth(targetMonth)
      // Auto-save to DB
      setSaving(true)
      try {
        const resp = await fetch(`${API_BASE}/api/energy/charging-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: targetMonth, rows: json, fileName: file.name }),
        })
        const data = await resp.json()
        if (data.ok) {
          setSavedAt(new Date().toISOString())
          loadMonths()
        }
      } finally {
        setSaving(false)
      }
    } catch (e) {
      setError(`שגיאה בקריאת הקובץ: ${e.message}`)
    }
  }

  const partners = useMemo(() => {
    const set = new Set(rows.map(r => r['PARTNER']).filter(Boolean))
    return [...set].sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (partnerFilter && r['PARTNER'] !== partnerFilter) return false
      if (q) {
        const blob = `${r['EVSE NAME']||''} ${r['MEMBER NAME']||''} ${r['MEMBER NUMBER']||''} ${r['EVSE ID']||''}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [rows, search, partnerFilter])

  const totals = useMemo(() => ({
    sessions: filteredRows.length,
    kwh: filteredRows.reduce((s, r) => s + (Number(r['CONSUMPTION (KWH)']) || 0), 0),
    energy: filteredRows.reduce((s, r) => s + (Number(r['ENERGY PRICE (WITH TAXES)']) || 0), 0),
    service: filteredRows.reduce((s, r) => s + (Number(r['SERVICE FEE (WITH TAXES)']) || 0), 0),
    amount: filteredRows.reduce((s, r) => s + (Number(r['AMOUNT (WITH TAXES)']) || 0), 0),
  }), [filteredRows])

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/energy" className="ariel-back">&rarr; חזרה לאנרגיה</Link>
        <h1 className="ariel-title">ניהול מערכת חשמל{month ? ` — חודש ${month}` : ''}</h1>
        <p style={{ color: '#6b7280', marginBottom: '20px' }}>נתוני סשני טעינה מהאפליקציה</p>

        {/* Upload + filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => inputRef.current?.click()}
              style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
            >📂 טען קובץ Excel</button>
            {availableMonths.length > 0 && (
              <>
                <label style={{ fontSize: '13px', color: '#555', marginRight: '8px' }}>חודש:</label>
                <select
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}
                >
                  {availableMonths.map(m => (
                    <option key={m.month} value={m.month}>
                      {m.month} ({m.count} סשנים)
                    </option>
                  ))}
                </select>
              </>
            )}
            {rows.length > 0 && (
              <button
                onClick={generateCommitteesReport}
                style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
              >📄 סיכום ועדים</button>
            )}
            {rows.length > 0 && Object.keys(phoneToCust).length > 0 && (
              <button
                onClick={async () => {
                  // Group by customer (using phoneToCust mapping) and sum SERVICE FEE (gross, incl VAT)
                  const byCust = {}
                  for (const r of rows) {
                    const phone = r['MEMBER NUMBER']
                    const m = phoneToCust[phone]
                    if (!m) continue
                    const cust = m.custname
                    if (!byCust[cust]) byCust[cust] = { custname: cust, custdes: m.custdes, total: 0 }
                    byCust[cust].total += Number(r['SERVICE FEE (WITH TAXES)']) || 0
                  }
                  const list = Object.values(byCust).filter(c => c.total > 0)
                  if (!list.length) { alert('אין לקוחות להפקת חשבונית'); return }
                  if (!confirm(`להפיק 2 חשבוניות ראשונות (טיוטא) מתוך ${list.length} לקוחות, סניף 110?`)) return
                  try {
                    const resp = await fetch(`${API_BASE}/api/energy/create-invoices`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ month, customers: list, limit: 2 }),
                    })
                    const d = await resp.json()
                    if (d.ok) {
                      const lines = d.results.map(r =>
                        r.ok ? `✓ ${r.custname}: ${r.ivnum} (${r.amount.toLocaleString('he-IL')} ₪)`
                             : `✗ ${r.custname}: ${r.error}`
                      ).join('\n')
                      alert(`תאריך: ${d.invDate}\nפרטים: ${d.details}\n\n${lines}`)
                    } else {
                      alert(`שגיאה: ${d.error}`)
                    }
                  } catch (e) {
                    alert(`שגיאה: ${e.message}`)
                  }
                }}
                style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
              >📑 הפק חשבונית</button>
            )}
          </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          {fileName && (
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              📄 {fileName}
              {saving && <span style={{ color: '#d97706', marginRight: '8px' }}>שומר...</span>}
              {!saving && savedAt && <span style={{ color: '#16a34a', marginRight: '8px' }}>✓ נשמר ב-DB</span>}
            </span>
          )}
          <button
            onClick={async () => {
              if (!confirm('סנכרן לקוחות מפריורטי? הפעולה תיקח כ-20 שניות.')) return
              setLookupBusy(true)
              try {
                const r = await fetch(`${API_BASE}/api/energy/sync-customers`, { method: 'POST' })
                const d = await r.json()
                if (d.ok) {
                  alert(`סונכרנו ${d.count} לקוחות`)
                  loadCustStatus()
                } else alert(`שגיאה: ${d.error}`)
              } finally { setLookupBusy(false) }
            }}
            disabled={lookupBusy}
            style={{ padding: '8px 16px', background: lookupBusy ? '#999' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: lookupBusy ? 'wait' : 'pointer' }}
          >
            {lookupBusy ? 'מסנכרן...' : '🔄 סנכרן לקוחות'}
          </button>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            {custStatus.updatedAt
              ? `${custStatus.count.toLocaleString('he-IL')} לקוחות`
              : 'לא בוצע סנכרון'}
          </span>
          {rows.length > 0 && (
            <button
              onClick={lookupCustomers}
              disabled={lookupBusy}
              style={{ padding: '8px 16px', background: '#0891b2', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
            >
              🔍 מלא מספרי לקוח
            </button>
          )}
          {Object.keys(phoneToCust).length > 0 && (
            <span style={{ fontSize: '12px', color: '#16a34a' }}>
              ✓ {Object.keys(phoneToCust).length} נמצאו
            </span>
          )}
        </div>
        </div>

        {error && (
          <div style={{ background: '#fee', color: '#c00', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>{error}</div>
        )}

        {rows.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="חיפוש: שם, טלפון, עמדה..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', width: '220px' }}
              />
              <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px' }}
              >
                <option value="">כל האתרים ({partners.length})</option>
                {partners.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginRight: 'auto' }}>
                <span>סשנים: <strong>{totals.sessions.toLocaleString('he-IL')}</strong></span>
                <span>סה"כ kWh: <strong>{fmtNum(totals.kwh)}</strong></span>
                <span>חשמל ₪: <strong>{fmtNum(totals.energy)}</strong></span>
                <span>שירות ₪: <strong>{fmtNum(totals.service)}</strong></span>
                <span>סה"כ ₪: <strong>{fmtNum(totals.amount)}</strong></span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
              <table className="ariel-table" style={{ fontSize: '12px', borderCollapse: 'collapse', width: 'auto' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#1e3a5f', color: '#fff', zIndex: 1 }}>
                  <tr>
                    {COLS.map(c => (
                      <th key={c.key} style={{ padding: '6px 8px', minWidth: c.width, textAlign: 'right', whiteSpace: 'nowrap' }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 500).map((r, i) => {
                    const phone = r['MEMBER NUMBER']
                    const custMatch = phone && phoneToCust[phone]
                    return (
                    <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 ? '#f9fafb' : '#fff' }}>
                      {COLS.map(c => {
                        let val
                        if (c.key === '_PRIORITY_CUST') {
                          val = custMatch ? `${custMatch.custname}` : ''
                        } else {
                          val = c.num ? fmtNum(r[c.key]) : (r[c.key] || '')
                        }
                        return (
                          <td key={c.key} style={{ padding: '4px 8px', textAlign: c.num ? 'left' : 'right', whiteSpace: 'nowrap', direction: c.num ? 'ltr' : 'rtl', background: c.key === '_PRIORITY_CUST' && val ? '#d4edda' : undefined }}
                              title={c.key === '_PRIORITY_CUST' && custMatch ? custMatch.custdes : undefined}>
                            {val}
                          </td>
                        )
                      })}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredRows.length > 500 && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
                מציג 500 שורות ראשונות מתוך {filteredRows.length}. השתמש בסינון לצמצום.
              </div>
            )}
          </>
        )}

        {rows.length === 0 && (
          <div style={{ color: '#888', fontSize: '14px', padding: '40px', textAlign: 'center', border: '2px dashed #ccc', borderRadius: '8px' }}>
            טען קובץ Excel של דוח סשני טעינה
          </div>
        )}
      </div>
    </div>
  )
}
