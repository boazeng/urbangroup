import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'
import './ArielHRPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

// Column indices in the data (A=0, B=1, ... V=21)
const COL = {
  TRACKING: 1,    // B - מעקב
  CUSTOMER: 2,    // C - לקוח
  SITE: 3,        // D - אתר
  PROFESSION_NUM: 4, // E - מס מקצוע
  PROFESSION: 5,  // F - מקצוע
  TARIFF_TYPE: 6, // G - סוג תעריף
  TARIFF_NOTES: 7,// H - הערות לסוג תעריף
  NOTES: 8,       // I - הערות
  CONTRACTOR: 9,  // J - כינוי קבלן
  HOURS_REG: 10,  // K - שעות רגילות
  HOURS_125: 11,  // L - שעות נוספות 125%
  HOURS_150: 12,  // M - שעות נוספות 150%
  CUST_RATE: 13,  // N - לקוח תעריף שעה רגילה
  CUST_125: 14,   // O - לקוח תעריף 125%
  CUST_150: 15,   // P - לקוח תעריף 150%
  CUST_TOTAL: 16, // Q - סהכ עלות ללקוח
  CONT_RATE: 17,  // R - קבלן תעריף שעה רגילה
  CONT_125: 18,   // S - קבלן תעריף 125%
  CONT_150: 19,   // T - קבלן תעריף 150%
  CONT_TOTAL: 20, // U - סהכ תשלום לקבלן
  GAP: 21,        // V - פער
  ROW_INDEX: 22,  // appended by backend — original Excel row number
}

// Visible columns to display — extra: true for overtime columns (hidden by default)
const DISPLAY_COLS = [
  { idx: COL.CUSTOMER, label: 'לקוח', type: 'text', wide: true },
  { idx: COL.SITE, label: 'אתר', type: 'text', wide: true },
  { idx: COL.PROFESSION_NUM, label: 'מס מקצוע', type: 'num', narrow: true },
  { idx: COL.PROFESSION, label: 'מקצוע', type: 'text', narrow: true },
  { idx: COL.TARIFF_TYPE, label: 'סוג תעריף', type: 'text', narrow: true },
  { idx: COL.TARIFF_NOTES, label: 'הערות תעריף', type: 'text', narrow: true },
  { idx: COL.NOTES, label: 'הערות', type: 'text', narrow: true },
  { idx: COL.CONTRACTOR, label: 'כינוי קבלן', type: 'text', narrow: true },
  { idx: COL.HOURS_REG, label: 'שעות רגילות', type: 'num', narrow: true },
  { idx: COL.HOURS_125, label: 'שעות 125%', type: 'num', extra: true },
  { idx: COL.HOURS_150, label: 'שעות 150%', type: 'num', extra: true },
  { idx: COL.CUST_RATE, label: 'תעריף לקוח', type: 'num', narrow: true },
  { idx: COL.CUST_125, label: 'לקוח 125%', type: 'num', extra: true },
  { idx: COL.CUST_150, label: 'לקוח 150%', type: 'num', extra: true },
  { idx: COL.CUST_TOTAL, label: 'סה"כ לקוח', type: 'num', narrow: true },
  { idx: COL.CONT_RATE, label: 'תעריף קבלן', type: 'num', narrow: true },
  { idx: COL.CONT_125, label: 'קבלן 125%', type: 'num', extra: true },
  { idx: COL.CONT_150, label: 'קבלן 150%', type: 'num', extra: true },
  { idx: COL.CONT_TOTAL, label: 'סה"כ קבלן', type: 'num', narrow: true },
  { idx: COL.GAP, label: 'פער', type: 'num', narrow: true },
]

function cellVal(v) {
  if (v === null || v === undefined) return ''
  return String(v)
}

export default function ArielHRPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [allRows, setAllRows] = useState([])       // original data from server
  const [editedRows, setEditedRows] = useState([])  // working copy with edits
  const [dirtyKeys, setDirtyKeys] = useState(new Set()) // "excelRow:colIdx" keys
  const [filters, setFilters] = useState({
    customers: [], sites: [], contractors: [], customer_sites: {}
  })
  const [selectedContractor, setSelectedContractor] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedSite, setSelectedSite] = useState('')
  const [showExtra, setShowExtra] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/api/hr/sheet-data?sheet=2.26`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setAllRows(data.rows)
          setEditedRows(data.rows.map(r => [...r]))
          setFilters(data.filters)
          setDirtyKeys(new Set())
        } else {
          setError(data.error || 'שגיאה בטעינה')
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Sites available for selected customer
  const availableSites = useMemo(() => {
    if (selectedCustomer && filters.customer_sites?.[selectedCustomer]) {
      return filters.customer_sites[selectedCustomer]
    }
    return filters.sites || []
  }, [selectedCustomer, filters])

  // Reset site if customer changes and site is no longer valid
  useEffect(() => {
    if (selectedSite && !availableSites.includes(selectedSite)) {
      setSelectedSite('')
    }
  }, [availableSites, selectedSite])

  // Filter rows (use editedRows for display)
  const filteredRows = useMemo(() => {
    if (!selectedContractor && !selectedCustomer && !selectedSite) return []

    return editedRows.filter(row => {
      const customer = String(row[COL.CUSTOMER] || '').trim()
      const site = String(row[COL.SITE] || '').trim()
      const contractor = String(row[COL.CONTRACTOR] || '').trim()

      if (selectedContractor && contractor !== selectedContractor) return false
      if (selectedCustomer && customer !== selectedCustomer) return false
      if (selectedSite && site !== selectedSite) return false
      return true
    })
  }, [editedRows, selectedContractor, selectedCustomer, selectedSite])

  const clearFilters = () => {
    setSelectedContractor('')
    setSelectedCustomer('')
    setSelectedSite('')
  }

  // Columns to show (hide overtime extras by default)
  const visibleCols = useMemo(() =>
    DISPLAY_COLS.filter(col => !col.extra || showExtra),
    [showExtra]
  )

  // Handle cell edit
  const handleCellChange = useCallback((excelRow, colIdx, value) => {
    setEditedRows(prev => {
      const next = prev.map(r => {
        if (r[COL.ROW_INDEX] === excelRow) {
          const copy = [...r]
          copy[colIdx] = value
          return copy
        }
        return r
      })
      return next
    })

    // Find original value
    const origRow = allRows.find(r => r[COL.ROW_INDEX] === excelRow)
    const origVal = cellVal(origRow ? origRow[colIdx] : '')
    const key = `${excelRow}:${colIdx}`

    setDirtyKeys(prev => {
      const next = new Set(prev)
      if (cellVal(value) !== origVal) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [allRows])

  // Save changes
  const handleSave = async () => {
    if (dirtyKeys.size === 0) return
    setSaving(true)
    setError('')

    const changes = []
    for (const key of dirtyKeys) {
      const [rowStr, colStr] = key.split(':')
      const excelRow = Number(rowStr)
      const colIdx = Number(colStr)
      const editedRow = editedRows.find(r => r[COL.ROW_INDEX] === excelRow)
      if (editedRow) {
        changes.push({ row: excelRow, col: colIdx, value: editedRow[colIdx] ?? '' })
      }
    }

    try {
      const resp = await fetch(`${API_BASE}/api/hr/save-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet: '2.26', changes }),
      })
      const data = await resp.json()
      if (data.ok) {
        // Update allRows to match editedRows (so they're no longer "dirty")
        setAllRows(editedRows.map(r => [...r]))
        setDirtyKeys(new Set())
      } else {
        setError(data.error || 'שגיאה בשמירה')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const hasFilter = selectedContractor || selectedCustomer || selectedSite
  const hasDirty = dirtyKeys.size > 0

  return (
    <div className="ariel-page hr-page">
      <div className="hr-container">
        <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>

        <h1 className="ariel-title">ניהול כ&quot;א</h1>
        <p className="hr-subtitle">ניהול הצבות באתרים — טבלה ראשית — 2.26</p>

        {error && <div className="ariel-error">{error}</div>}

        {loading ? (
          <div className="ariel-loading">
            <div className="ariel-spinner" />
            <span>טוען נתונים מ-SharePoint...</span>
          </div>
        ) : (
          <>
            {/* Filters + Save */}
            <div className="hr-filters">
              <div className="hr-filter-group">
                <label className="hr-filter-label">לקוח</label>
                <select
                  className="hr-filter-select"
                  value={selectedCustomer}
                  onChange={e => setSelectedCustomer(e.target.value)}
                >
                  <option value="">— בחר לקוח —</option>
                  {filters.customers?.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {selectedCustomer && (
                  <button className="hr-filter-clear-icon" onClick={() => setSelectedCustomer('')} title="נקה לקוח">&#128465;</button>
                )}
              </div>

              <div className="hr-filter-group">
                <label className="hr-filter-label">אתר</label>
                <select
                  className="hr-filter-select"
                  value={selectedSite}
                  onChange={e => setSelectedSite(e.target.value)}
                >
                  <option value="">— בחר אתר —</option>
                  {availableSites.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {selectedSite && (
                  <button className="hr-filter-clear-icon" onClick={() => setSelectedSite('')} title="נקה אתר">&#128465;</button>
                )}
              </div>

              <div className="hr-filter-group">
                <label className="hr-filter-label">קבלן</label>
                <select
                  className="hr-filter-select"
                  value={selectedContractor}
                  onChange={e => setSelectedContractor(e.target.value)}
                >
                  <option value="">— בחר קבלן —</option>
                  {filters.contractors?.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {selectedContractor && (
                  <button className="hr-filter-clear-icon" onClick={() => setSelectedContractor('')} title="נקה קבלן">&#128465;</button>
                )}
              </div>

              {hasFilter && (
                <span className="hr-row-count">{filteredRows.length} שורות</span>
              )}

              <button
                className="hr-toggle-extra-btn"
                onClick={() => setShowExtra(v => !v)}
              >
                {showExtra ? 'הסתר שעות נוספות' : 'הצג שעות נוספות'}
              </button>

              {hasDirty && (
                <button
                  className="hr-save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'שומר...' : `שמור שינויים (${dirtyKeys.size})`}
                </button>
              )}
            </div>

            {/* Table */}
            {!hasFilter ? (
              <div className="hr-empty">בחר קבלן, לקוח או אתר כדי להציג נתונים</div>
            ) : filteredRows.length === 0 ? (
              <div className="hr-empty">לא נמצאו נתונים לסינון הנבחר</div>
            ) : (
              <div className="ariel-card hr-table-wrapper">
                <table className="ariel-table hr-table">
                  <thead>
                    <tr>
                      <th className="hr-td-row-num">#</th>
                      {visibleCols.map(col => (
                        <th key={col.idx} className={`${col.type === 'num' ? 'ariel-num' : ''}${col.narrow ? ' hr-td-narrow' : ''}${col.wide ? ' hr-td-wide' : ''}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => {
                      const excelRow = row[COL.ROW_INDEX]
                      return (
                        <tr key={excelRow}>
                          <td className="ariel-num hr-td-row-num">{i + 1}</td>
                          {visibleCols.map(col => {
                            const key = `${excelRow}:${col.idx}`
                            const isDirty = dirtyKeys.has(key)
                            return (
                              <td key={col.idx} className={`${col.type === 'num' ? 'ariel-num' : ''}${col.narrow ? ' hr-td-narrow' : ''}${col.wide ? ' hr-td-wide' : ''}`}>
                                <input
                                  className={`hr-cell-input${isDirty ? ' hr-cell-dirty' : ''}`}
                                  type="text"
                                  value={cellVal(row[col.idx])}
                                  onChange={e => handleCellChange(excelRow, col.idx, e.target.value)}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
