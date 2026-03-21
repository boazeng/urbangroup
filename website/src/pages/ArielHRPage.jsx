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
  PRIORITY_NUM: 22, // W - מספר פריורטי
  ROW_INDEX: 23,  // appended by backend — original Excel row number
}

// Visible columns to display — extra: true for overtime columns (hidden by default)
const DISPLAY_COLS = [
  { idx: COL.TRACKING, label: 'מעקב', type: 'num', xnarrow: true },
  { idx: COL.PRIORITY_NUM, label: 'מס פריורטי', type: 'text', xnarrow: true },
  { idx: COL.CUSTOMER, label: 'לקוח', type: 'text', wide: true },
  { idx: COL.SITE, label: 'אתר', type: 'text', wide: true },
  { idx: COL.PROFESSION_NUM, label: 'מס מקצוע', type: 'num', xnarrow: true },
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
  { idx: COL.CUST_TOTAL, label: 'סה"כ לקוח', type: 'num', narrow: true, totals: true },
  { idx: COL.CONT_RATE, label: 'תעריף קבלן', type: 'num', narrow: true },
  { idx: COL.CONT_125, label: 'קבלן 125%', type: 'num', extra: true },
  { idx: COL.CONT_150, label: 'קבלן 150%', type: 'num', extra: true },
  { idx: COL.CONT_TOTAL, label: 'סה"כ קבלן', type: 'num', narrow: true, totals: true },
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
  const [deletedRows, setDeletedRows] = useState(new Set()) // ROW_INDEX values marked for deletion
  const [filters, setFilters] = useState({
    customers: [], sites: [], contractors: [], customer_sites: {}
  })
  const [selectedContractor, setSelectedContractor] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedSite, setSelectedSite] = useState('')
  const [showExtra, setShowExtra] = useState(false)
  const [showTotals, setShowTotals] = useState(false)
  const [activeOnly, setActiveOnly] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [nextNewId, setNextNewId] = useState(1)   // counter for new row temp IDs

  // Draggable grand totals order
  const [totalsOrder, setTotalsOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('hr-totals-order')
      if (saved) return JSON.parse(saved)
    } catch {}
    return ['income', 'expense', 'gap']
  })
  const [dragItem, setDragItem] = useState(null)

  // Sheet (month) selector
  const [availableSheets, setAvailableSheets] = useState([])
  const [selectedSheet, setSelectedSheet] = useState('2.26')

  // Priority sync state
  const [priorityCustomers, setPriorityCustomers] = useState([])
  const [prioritySuppliers, setPrioritySuppliers] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState('')
  const [showPriorityTable, setShowPriorityTable] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/hr/sheets`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setAvailableSheets(data.sheets)
      })
      .catch(() => {})
  }, [])

  const handleSyncPriority = () => {
    setSyncing(true)
    fetch(`${API_BASE}/api/hr/sync-priority`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setPriorityCustomers(data.customers || [])
          setPrioritySuppliers(data.suppliers || [])
          setLastSyncTime(data.syncedAt || '')
          setShowPriorityTable(true)
        } else {
          setError(data.error || 'שגיאה בסנכרון')
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setSyncing(false))
  }

  const loadData = () => {
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/api/hr/sheet-data?sheet=${encodeURIComponent(selectedSheet)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setAllRows(data.rows)
          setEditedRows(data.rows.map(r => [...r]))
          setFilters(data.filters)
          setDirtyKeys(new Set())
          setDeletedRows(new Set())
        } else {
          setError(data.error || 'שגיאה בטעינה')
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [selectedSheet])

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
    if (!showAll && !selectedContractor && !selectedCustomer && !selectedSite) return []

    return editedRows.filter(row => {
      if (!showAll) {
        const customer = String(row[COL.CUSTOMER] || '').trim()
        const site = String(row[COL.SITE] || '').trim()
        const contractor = String(row[COL.CONTRACTOR] || '').trim()

        if (selectedContractor && contractor !== selectedContractor) return false
        if (selectedCustomer && customer !== selectedCustomer) return false
        if (selectedSite && site !== selectedSite) return false
      }
      if (activeOnly) {
        const hours = row[COL.HOURS_REG]
        if (hours === null || hours === undefined || hours === '' || hours === 0) return false
      }
      return true
    })
  }, [editedRows, selectedContractor, selectedCustomer, selectedSite, activeOnly, showAll])

  // Contractor total (sum of CONT_TOTAL) — only when contractor filter is active
  const contractorTotal = useMemo(() => {
    if (!selectedContractor) return null
    let sum = 0
    for (const row of filteredRows) {
      const val = Number(row[COL.CONT_TOTAL])
      if (!isNaN(val)) sum += val
    }
    return sum
  }, [filteredRows, selectedContractor])

  const [showContractorSites, setShowContractorSites] = useState(false)

  // Contractor breakdown by site
  const contractorSiteBreakdown = useMemo(() => {
    if (!selectedContractor) return []
    const map = {}
    for (const row of filteredRows) {
      const customer = cellVal(row[COL.CUSTOMER])
      const site = cellVal(row[COL.SITE])
      const key = `${customer}|${site}`
      if (!map[key]) map[key] = { customer, site, total: 0 }
      map[key].total += Number(row[COL.CONT_TOTAL]) || 0
    }
    return Object.values(map).filter(r => r.total !== 0).sort((a, b) => b.total - a.total)
  }, [filteredRows, selectedContractor])

  // Grand totals — all data rows (not filtered)
  const grandTotals = useMemo(() => {
    let custTotal = 0
    let contTotal = 0
    for (const row of editedRows) {
      custTotal += Number(row[COL.CUST_TOTAL]) || 0
      contTotal += Number(row[COL.CONT_TOTAL]) || 0
    }
    return { custTotal, contTotal, gap: custTotal - contTotal }
  }, [editedRows])

  // Drag handlers for grand totals reordering
  const handleTotalDragStart = (key) => setDragItem(key)
  const handleTotalDragOver = (e, key) => {
    e.preventDefault()
    if (!dragItem || dragItem === key) return
    setTotalsOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(dragItem)
      const toIdx = next.indexOf(key)
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, dragItem)
      return next
    })
  }
  const handleTotalDragEnd = () => {
    setDragItem(null)
    localStorage.setItem('hr-totals-order', JSON.stringify(totalsOrder))
  }

  // Site summary — group by profession, sum hours and totals
  const siteSummary = useMemo(() => {
    if (!selectedSite) return null

    // Get rows for this site (from editedRows, respecting filters except site is already set)
    const siteRows = editedRows.filter(row => {
      const site = String(row[COL.SITE] || '').trim()
      if (site !== selectedSite) return false
      if (selectedContractor && String(row[COL.CONTRACTOR] || '').trim() !== selectedContractor) return false
      if (selectedCustomer && String(row[COL.CUSTOMER] || '').trim() !== selectedCustomer) return false
      return true
    })

    const byGroup = {}
    let totalCustomer = 0
    let totalContractor = 0

    for (const row of siteRows) {
      const profNum = String(row[COL.PROFESSION_NUM] || '').trim()
      const profName = String(row[COL.PROFESSION] || '').trim()
      const tariffType = String(row[COL.TARIFF_TYPE] || '').trim()
      const tariffNotes = String(row[COL.TARIFF_NOTES] || '').trim()
      const notes = String(row[COL.NOTES] || '').trim()
      const custRate = Number(row[COL.CUST_RATE]) || 0
      const key = `${profNum}|${tariffType}|${tariffNotes}|${notes}`

      if (!byGroup[key]) {
        byGroup[key] = { profNum, profName, tariffType, tariffNotes, notes, custRate, hoursReg: 0, hours125: 0, hours150: 0, custTotal: 0, contTotal: 0 }
      }
      const p = byGroup[key]
      p.hoursReg += Number(row[COL.HOURS_REG]) || 0
      p.hours125 += Number(row[COL.HOURS_125]) || 0
      p.hours150 += Number(row[COL.HOURS_150]) || 0
      p.custTotal += Number(row[COL.CUST_TOTAL]) || 0
      p.contTotal += Number(row[COL.CONT_TOTAL]) || 0
      totalCustomer += Number(row[COL.CUST_TOTAL]) || 0
      totalContractor += Number(row[COL.CONT_TOTAL]) || 0
    }

    // Filter out groups with zero regular hours
    const professions = Object.values(byGroup).filter(p => p.hoursReg > 0)

    return {
      professions,
      totalCustomer,
      totalContractor,
    }
  }, [editedRows, selectedSite, selectedContractor, selectedCustomer])

  const clearFilters = () => {
    setSelectedContractor('')
    setSelectedCustomer('')
    setSelectedSite('')
  }

  // Columns to show (hide overtime extras and totals by default)
  const visibleCols = useMemo(() =>
    DISPLAY_COLS.filter(col => (!col.extra || showExtra) && (!col.totals || showTotals)),
    [showExtra, showTotals]
  )

  // Columns that trigger auto-recalculation
  const HOURS_COLS = new Set([COL.HOURS_REG, COL.HOURS_125, COL.HOURS_150])
  const CUST_RATE_COLS = new Set([COL.CUST_RATE, COL.CUST_125, COL.CUST_150])
  const CONT_RATE_COLS = new Set([COL.CONT_RATE, COL.CONT_125, COL.CONT_150])

  function recalcRow(row) {
    const hrs = Number(row[COL.HOURS_REG]) || 0
    const hrs125 = Number(row[COL.HOURS_125]) || 0
    const hrs150 = Number(row[COL.HOURS_150]) || 0
    row[COL.CUST_TOTAL] = (hrs * (Number(row[COL.CUST_RATE]) || 0))
      + (hrs125 * (Number(row[COL.CUST_125]) || 0))
      + (hrs150 * (Number(row[COL.CUST_150]) || 0))
    row[COL.CONT_TOTAL] = (hrs * (Number(row[COL.CONT_RATE]) || 0))
      + (hrs125 * (Number(row[COL.CONT_125]) || 0))
      + (hrs150 * (Number(row[COL.CONT_150]) || 0))
    row[COL.GAP] = row[COL.CUST_TOTAL] - row[COL.CONT_TOTAL]
  }

  // Handle cell edit
  const handleCellChange = useCallback((excelRow, colIdx, value) => {
    const needsRecalc = HOURS_COLS.has(colIdx) || CUST_RATE_COLS.has(colIdx) || CONT_RATE_COLS.has(colIdx)

    setEditedRows(prev => {
      const next = prev.map(r => {
        if (r[COL.ROW_INDEX] === excelRow) {
          const copy = [...r]
          copy[colIdx] = value
          if (needsRecalc) recalcRow(copy)
          return copy
        }
        return r
      })
      return next
    })

    // Find original value and mark dirty cells
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
      // Mark calculated fields as dirty too
      if (needsRecalc) {
        next.add(`${excelRow}:${COL.CUST_TOTAL}`)
        next.add(`${excelRow}:${COL.CONT_TOTAL}`)
        next.add(`${excelRow}:${COL.GAP}`)
      }
      return next
    })
  }, [allRows])

  // Duplicate row with empty hours
  const handleDuplicateRow = (excelRow) => {
    setEditedRows(prev => {
      const sourceRow = prev.find(r => r[COL.ROW_INDEX] === excelRow)
      if (!sourceRow) return prev

      const newRow = [...sourceRow]
      const tempId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      // Set defaults for new row
      newRow[COL.TRACKING] = 0
      newRow[COL.HOURS_REG] = ''
      newRow[COL.HOURS_125] = ''
      newRow[COL.HOURS_150] = ''
      newRow[COL.CUST_TOTAL] = ''
      newRow[COL.CONT_TOTAL] = ''
      newRow[COL.GAP] = ''
      newRow[COL.ROW_INDEX] = tempId

      const idx = prev.findIndex(r => r[COL.ROW_INDEX] === excelRow)
      const next = [...prev]
      next.splice(idx + 1, 0, newRow)

      // Mark non-empty cells as dirty (schedule after state update)
      const dirtyNew = new Set()
      for (const col of DISPLAY_COLS) {
        if (newRow[col.idx] !== '' && newRow[col.idx] !== null && newRow[col.idx] !== undefined) {
          dirtyNew.add(`${tempId}:${col.idx}`)
        }
      }
      setTimeout(() => setDirtyKeys(p => new Set([...p, ...dirtyNew])), 0)

      return next
    })
    // Turn off activeOnly so new row is visible
    if (activeOnly) setActiveOnly(false)
  }

  // Mark row for deletion (toggle)
  const handleDeleteRow = useCallback((excelRow) => {
    setDeletedRows(prev => {
      const next = new Set(prev)
      if (next.has(excelRow)) {
        next.delete(excelRow)
      } else {
        next.add(excelRow)
      }
      return next
    })
  }, [])

  // Save changes
  const handleSave = async () => {
    if (dirtyKeys.size === 0 && deletedRows.size === 0) return
    setSaving(true)
    setError('')

    // Separate existing cell updates from new rows
    const changes = []
    const newRows = []
    const newRowIds = new Set()

    for (const key of dirtyKeys) {
      const [rowStr] = key.split(':')
      if (rowStr.startsWith('new_')) {
        newRowIds.add(rowStr)
      }
    }

    // Collect cell-level changes for existing rows
    for (const key of dirtyKeys) {
      const [rowStr, colStr] = key.split(':')
      if (rowStr.startsWith('new_')) continue
      const excelRow = Number(rowStr)
      const colIdx = Number(colStr)
      const editedRow = editedRows.find(r => r[COL.ROW_INDEX] === excelRow)
      if (editedRow) {
        changes.push({ row: excelRow, col: colIdx, value: editedRow[colIdx] ?? '' })
      }
    }

    // Collect full new rows with position info (columns A-V = indices 0-21)
    for (const tempId of newRowIds) {
      const idx = editedRows.findIndex(r => r[COL.ROW_INDEX] === tempId)
      if (idx === -1) continue
      const row = editedRows[idx]
      // Find the row above to determine insert position
      let afterRow = null
      for (let j = idx - 1; j >= 0; j--) {
        const prevId = editedRows[j][COL.ROW_INDEX]
        if (typeof prevId === 'number') {
          afterRow = prevId
          break
        }
      }
      newRows.push({ data: row.slice(0, 23), afterRow })
    }

    // Collect deleted row indices (only real Excel rows, not new ones)
    const deleteRowIndices = []
    for (const rowId of deletedRows) {
      if (typeof rowId === 'number') {
        deleteRowIndices.push(rowId)
      }
    }

    try {
      const resp = await fetch(`${API_BASE}/api/hr/save-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet: selectedSheet, changes, newRows, deleteRows: deleteRowIndices }),
      })
      const data = await resp.json()
      if (data.ok) {
        // Update new rows with their real Excel row indices
        if (data.newRowIndices && data.newRowIndices.length > 0) {
          const tempIds = [...newRowIds]
          setEditedRows(prev => prev.map(r => {
            const tIdx = tempIds.indexOf(r[COL.ROW_INDEX])
            if (tIdx !== -1 && data.newRowIndices[tIdx] !== undefined) {
              const copy = [...r]
              copy[COL.ROW_INDEX] = data.newRowIndices[tIdx]
              return copy
            }
            return r
          }))
        }
        // Remove deleted rows from state
        if (deletedRows.size > 0) {
          setEditedRows(prev => prev.filter(r => !deletedRows.has(r[COL.ROW_INDEX])))
        }
        setAllRows(editedRows.filter(r => !deletedRows.has(r[COL.ROW_INDEX])).map(r => [...r]))
        setDirtyKeys(new Set())
        setDeletedRows(new Set())
      } else {
        setError(data.error || 'שגיאה בשמירה')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const hasFilter = showAll || selectedContractor || selectedCustomer || selectedSite
  const hasDirty = dirtyKeys.size > 0 || deletedRows.size > 0

  return (
    <div className="ariel-page hr-page">
      <div className="hr-container">
        <div className="hr-header-row">
          <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>
          <h1 className="ariel-title hr-title-center">ניהול כ&quot;א חברת אריאל</h1>
          <div className="hr-sheet-group">
            <span className="hr-sheet-label">חודש עבודה:</span>
            <select
              className="hr-sheet-select"
              value={selectedSheet}
              onChange={e => setSelectedSheet(e.target.value)}
            >
              {availableSheets.length > 0
                ? availableSheets.map(s => <option key={s} value={s}>{s}</option>)
                : <option value={selectedSheet}>{selectedSheet}</option>
              }
            </select>
          </div>
        </div>

        <div className="hr-sync-row">
          <button className="hr-sync-btn" onClick={handleSyncPriority} disabled={syncing}>
            {syncing ? 'מסנכרן...' : 'סנכרון עם פריורטי'}
          </button>
          {lastSyncTime && (
            <span className="hr-sync-time">סנכרון אחרון: {lastSyncTime}</span>
          )}
        </div>

        {editedRows.length > 0 && (
          <div className="hr-grand-totals">
            {totalsOrder.map(key => {
              const cfg = {
                income:  { cls: 'hr-total-income',  label: 'סה"כ הכנסות מלקוחות:', value: grandTotals.custTotal },
                expense: { cls: 'hr-total-expense', label: 'סה"כ הוצאות לקבלנים:', value: grandTotals.contTotal },
                gap:     { cls: 'hr-total-gap',     label: 'פער (רווח):',          value: grandTotals.gap },
              }[key]
              return (
                <div
                  key={key}
                  className={`hr-grand-total-item ${cfg.cls}${dragItem === key ? ' hr-total-dragging' : ''}`}
                  draggable
                  onDragStart={() => handleTotalDragStart(key)}
                  onDragOver={(e) => handleTotalDragOver(e, key)}
                  onDragEnd={handleTotalDragEnd}
                >
                  <span className="hr-grand-total-label">{cfg.label}</span>
                  <span className="hr-grand-total-value">{cfg.value.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</span>
                </div>
              )
            })}
          </div>
        )}

        <div className="hr-top-actions">
          <button className="hr-refresh-btn" onClick={loadData} disabled={loading}>
            {loading ? 'טוען...' : 'רענן'}
          </button>
          <button
            className={`hr-toggle-extra-btn hr-show-all-btn${showAll ? ' hr-toggle-active' : ''}`}
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? 'חזור לסינון' : 'הצג את כל הטבלה'}
          </button>
        </div>

        {contractorTotal !== null && (
          <div className="hr-contractor-block">
            <div className="hr-contractor-summary">
              <span className="hr-summary-label">סיכום קבלן:</span>
              <span className="hr-summary-value">{contractorTotal.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</span>
              <button
                className={`hr-toggle-extra-btn${showContractorSites ? ' hr-toggle-active' : ''}`}
                onClick={() => setShowContractorSites(v => !v)}
              >
                {showContractorSites ? 'הסתר חלוקה' : 'הצג חלוקה לאתרים'}
              </button>
            </div>
            {showContractorSites && contractorSiteBreakdown.length > 0 && (
              <div className="hr-contractor-sites-table">
                <table className="ariel-table hr-summary-table">
                  <thead>
                    <tr>
                      <th>לקוח</th>
                      <th>אתר</th>
                      <th>תשלום לקבלן</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractorSiteBreakdown.map((r, i) => (
                      <tr key={i}>
                        <td>{r.customer}</td>
                        <td>{r.site}</td>
                        <td className="ariel-num">{r.total.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    <tr className="hr-summary-total-row">
                      <td colSpan={2}><strong>סה&quot;כ</strong></td>
                      <td className="ariel-num"><strong>{contractorTotal.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
                <button className="hr-clear-btn" onClick={clearFilters}>
                  נקה סינון
                </button>
              )}

              {hasFilter && (
                <span className="hr-row-count">{filteredRows.length} שורות</span>
              )}

              <button
                className="hr-toggle-extra-btn"
                onClick={() => setShowExtra(v => !v)}
              >
                {showExtra ? 'הסתר שעות נוספות' : 'הצג שעות נוספות'}
              </button>

              <button
                className={`hr-toggle-extra-btn${showTotals ? ' hr-toggle-active' : ''}`}
                onClick={() => setShowTotals(v => !v)}
              >
                {showTotals ? 'הסתר סיכומי לקוח קבלן' : 'הצג סיכומי לקוח קבלן'}
              </button>

              <button
                className={`hr-toggle-extra-btn${activeOnly ? ' hr-toggle-active' : ''}`}
                onClick={() => setActiveOnly(v => !v)}
              >
                {activeOnly ? 'הצג הכל' : 'רק שורות פעילות'}
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
                        <th key={col.idx} className={`${col.type === 'num' ? 'ariel-num' : ''}${col.xnarrow ? ' hr-td-xnarrow' : col.narrow ? ' hr-td-narrow' : ''}${col.wide ? ' hr-td-wide' : ''}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => {
                      const excelRow = row[COL.ROW_INDEX]
                      const isDeleted = deletedRows.has(excelRow)
                      return (
                        <tr key={excelRow} className={isDeleted ? 'hr-row-deleted' : ''}>
                          <td className="ariel-num hr-td-row-num">
                            <button className="hr-add-row-btn" onClick={() => handleDuplicateRow(excelRow)} title="שכפל שורה">+</button>
                            <span>{i + 1}</span>
                            <button className="hr-delete-row-btn" onClick={() => handleDeleteRow(excelRow)} title={isDeleted ? 'בטל מחיקה' : 'מחק שורה'}>&#128465;</button>
                          </td>
                          {visibleCols.map(col => {
                            const key = `${excelRow}:${col.idx}`
                            const isDirty = dirtyKeys.has(key)
                            return (
                              <td key={col.idx} className={`${col.type === 'num' ? 'ariel-num' : ''}${col.xnarrow ? ' hr-td-xnarrow' : col.narrow ? ' hr-td-narrow' : ''}${col.wide ? ' hr-td-wide' : ''}`}>
                                <input
                                  className={`hr-cell-input${isDirty ? ' hr-cell-dirty' : ''}`}
                                  type="text"
                                  value={cellVal(row[col.idx])}
                                  onChange={e => handleCellChange(excelRow, col.idx, e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'F10') {
                                      e.preventDefault()
                                      const rowIdx = filteredRows.indexOf(row)
                                      if (rowIdx > 0) {
                                        const aboveRow = filteredRows[rowIdx - 1]
                                        const aboveVal = cellVal(aboveRow[col.idx])
                                        handleCellChange(excelRow, col.idx, aboveVal)
                                      }
                                    }
                                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                      e.preventDefault()
                                      const rowIdx = filteredRows.indexOf(row)
                                      const targetIdx = e.key === 'ArrowUp' ? rowIdx - 1 : rowIdx + 1
                                      if (targetIdx >= 0 && targetIdx < filteredRows.length) {
                                        const targetExcelRow = filteredRows[targetIdx][COL.ROW_INDEX]
                                        const targetInput = document.querySelector(`input[data-cell="${targetExcelRow}:${col.idx}"]`)
                                        if (targetInput) targetInput.focus()
                                      }
                                    }
                                  }}
                                  data-cell={`${excelRow}:${col.idx}`}
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

            {/* Site summary table */}
            {siteSummary && (
              <div className="hr-site-summary">
                <h3 className="hr-site-summary-title">סיכום אתר: {selectedSite}</h3>
                <div className="hr-contractor-summary">
                  <span className="hr-summary-label">סה&quot;כ לקוח:</span>
                  <span className="hr-summary-value">{siteSummary.totalCustomer.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="ariel-card hr-table-wrapper">
                  <table className="ariel-table hr-table hr-summary-table">
                    <thead>
                      <tr>
                        <th>מס מקצוע</th>
                        <th>מקצוע</th>
                        <th>סוג תעריף</th>
                        <th>הערות תעריף</th>
                        <th>הערות</th>
                        <th>שעות רגילות</th>
                        {showExtra && <th>שעות 125%</th>}
                        {showExtra && <th>שעות 150%</th>}
                        <th>תעריף לקוח</th>
                        <th>סה&quot;כ לקוח</th>
                        <th>סה&quot;כ קבלן</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteSummary.professions.map((p, i) => (
                        <tr key={i}>
                          <td>{p.profNum}</td>
                          <td>{p.profName}</td>
                          <td>{p.tariffType}</td>
                          <td>{p.tariffNotes}</td>
                          <td>{p.notes}</td>
                          <td>{p.hoursReg.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                          {showExtra && <td>{p.hours125.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>}
                          {showExtra && <td>{p.hours150.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>}
                          <td>{p.custRate.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                          <td>{p.custTotal.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                          <td>{p.contTotal.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      <tr className="hr-summary-total-row">
                        <td></td>
                        <td><strong>סה&quot;כ</strong></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td><strong>{siteSummary.professions.reduce((s, p) => s + p.hoursReg, 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>
                        {showExtra && <td><strong>{siteSummary.professions.reduce((s, p) => s + p.hours125, 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>}
                        {showExtra && <td><strong>{siteSummary.professions.reduce((s, p) => s + p.hours150, 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>}
                        <td></td>
                        <td><strong>{siteSummary.totalCustomer.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>
                        <td><strong>{siteSummary.totalContractor.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {showPriorityTable && (priorityCustomers.length > 0 || prioritySuppliers.length > 0) && (
          <div className="hr-priority-section">
            <div className="hr-priority-header">
              <h3 className="hr-site-summary-title">לקוחות וספקים — פריורטי (סניף 102)</h3>
              <button className="hr-toggle-extra-btn" onClick={() => setShowPriorityTable(false)}>הסתר</button>
            </div>

            <div className="hr-priority-tables">
              {priorityCustomers.length > 0 && (
                <div className="hr-priority-table-wrap">
                  <h4 className="hr-priority-table-label">לקוחות ({priorityCustomers.length})</h4>
                  <div className="hr-table-wrapper">
                    <table className="ariel-table hr-summary-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>מספר לקוח</th>
                          <th>שם לקוח</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priorityCustomers.map((c, i) => (
                          <tr key={c.code}>
                            <td className="ariel-num">{i + 1}</td>
                            <td>{c.code}</td>
                            <td>{c.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {prioritySuppliers.length > 0 && (
                <div className="hr-priority-table-wrap">
                  <h4 className="hr-priority-table-label">ספקים ({prioritySuppliers.length})</h4>
                  <div className="hr-table-wrapper">
                    <table className="ariel-table hr-summary-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>מספר ספק</th>
                          <th>שם ספק</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prioritySuppliers.map((s, i) => (
                          <tr key={s.code}>
                            <td className="ariel-num">{i + 1}</td>
                            <td>{s.code}</td>
                            <td>{s.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
