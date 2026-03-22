import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'
import './ArielHRPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

// Column indices in the data (A=0, B=1, ... V=21)
// Column indices matching Excel: A=0, B=1, ... X=23
const COL = {
  TRACKING: 1,      // B - מעקב
  PRIORITY_NUM: 2,  // C - מספר פריורטי
  CUSTOMER: 3,      // D - לקוח
  FILLING: 4,       // E - מילוי
  SITE: 5,          // F - אתר
  PROFESSION_NUM: 6,// G - מס מקצוע
  PROFESSION: 7,    // H - מקצוע
  TARIFF_TYPE: 8,   // I - סוג תעריף
  TARIFF_NOTES: 9,  // J - הערות לסוג תעריף
  NOTES: 10,        // K - הערות
  CONTRACTOR: 11,   // L - כינוי קבלן
  HOURS_REG: 12,    // M - שעות רגילות
  HOURS_125: 13,    // N - שעות נוספות 125%
  HOURS_150: 14,    // O - שעות נוספות 150%
  CUST_RATE: 15,    // P - לקוח תעריף שעה רגילה
  CUST_125: 16,     // Q - לקוח תעריף 125%
  CUST_150: 17,     // R - לקוח תעריף 150%
  CUST_TOTAL: 18,   // S - סהכ עלות ללקוח
  CONT_RATE: 19,    // T - קבלן תעריף שעה רגילה
  CONT_125: 20,     // U - קבלן תעריף 125%
  CONT_150: 21,     // V - קבלן תעריף 150%
  CONT_TOTAL: 22,   // W - סהכ תשלום לקבלן
  GAP: 23,          // X - פער
  ROW_INDEX: 24,    // appended by backend — original Excel row number
}

// Visible columns to display — extra: true for overtime columns (hidden by default)
const DISPLAY_COLS = [
  { idx: COL.TRACKING, label: 'מעקב', type: 'num', tracking: true },
  { idx: COL.FILLING, label: 'מילוי', type: 'num', xnarrow: true },
  { idx: COL.PRIORITY_NUM, label: 'מס פריורטי', type: 'text', narrow: true },
  { idx: COL.CUSTOMER, label: 'לקוח', type: 'text', wide: true },
  { idx: COL.SITE, label: 'אתר', type: 'text', siteCol: true },
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

function safeJson(r) {
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('application/json')) throw new Error('השרת לא זמין')
  return r.json()
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
  const [showAll, setShowAll] = useState(true)
  const [showUnfilled, setShowUnfilled] = useState(false)
  const [showUnsent, setShowUnsent] = useState(false)
  const [deliveryNoteLoading, setDeliveryNoteLoading] = useState(false)
  const [deliveryNote, setDeliveryNote] = useState(null) // current draft/sent note
  const [dnSending, setDnSending] = useState(false)
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
  const [syncing, setSyncing] = useState(false)
  const [arielCustomers, setArielCustomers] = useState([])
  const [showArielCustomers, setShowArielCustomers] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [arielParts, setArielParts] = useState([])
  const [showArielParts, setShowArielParts] = useState(false)
  const [loadingParts, setLoadingParts] = useState(false)
  const [partSearch, setPartSearch] = useState('')
  const [lastSyncTime, setLastSyncTime] = useState(() => localStorage.getItem('hr-last-sync-time') || '')
  const [localSaveStatus, setLocalSaveStatus] = useState('') // '', 'saving', 'saved', 'error'
  const autoSaveTimer = useRef(null)

  // Auto-save to local backend (debounced)
  const autoSaveLocal = useCallback((rows, dirty, deleted) => {
    if (dirty.size === 0 && deleted.size === 0) {
      setLocalSaveStatus('')
      return
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      setLocalSaveStatus('saving')
      fetch(`${API_BASE}/api/hr/local-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheet: selectedSheet,
          rows,
          dirtyKeys: [...dirty],
          deletedRows: [...deleted],
        }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('local save failed')))
        .then(d => setLocalSaveStatus(d.ok ? 'saved' : 'error'))
        .catch(() => setLocalSaveStatus('error'))
    }, 1500)
  }, [selectedSheet])

  useEffect(() => {
    fetch(`${API_BASE}/api/hr/sheets`)
      .then(safeJson)
      .then(data => {
        if (data.ok) setAvailableSheets(data.sheets)
      })
      .catch(() => {})
  }, [])

  const handleSyncPriority = () => {
    setSyncing(true)
    fetch(`${API_BASE}/api/hr/sync-priority`)
      .then(safeJson)
      .then(data => {
        if (data.ok) {
          setArielParts([]) // clear cache so next click reloads updated parts
          const syncTime = data.syncedAt || new Date().toLocaleString('he-IL')
          setLastSyncTime(syncTime)
          localStorage.setItem('hr-last-sync-time', syncTime)
        } else {
          setError(data.error || 'שגיאה בסנכרון')
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setSyncing(false))
  }

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Load from SharePoint
      const resp = await fetch(`${API_BASE}/api/hr/sheet-data?sheet=${encodeURIComponent(selectedSheet)}`)
      const data = await safeJson(resp)
      if (!data.ok) {
        setError(data.error || 'שגיאה בטעינה')
        return
      }
      setAllRows(data.rows)
      setFilters(data.filters)

      // 2. Check for locally saved pending changes
      try {
        const localResp = await fetch(`${API_BASE}/api/hr/local-data?sheet=${encodeURIComponent(selectedSheet)}`)
        const localData = await localResp.json()
        if (localData.ok && localData.hasLocal && localData.dirtyKeys?.length > 0) {
          // Restore local edits on top of fresh SharePoint data
          setEditedRows(localData.rows.map(r => [...r]))
          setDirtyKeys(new Set(localData.dirtyKeys))
          setDeletedRows(new Set(localData.deletedRows || []))
          setLocalSaveStatus('saved')
          return
        }
      } catch {
        // Local data unavailable — proceed with clean SharePoint data
      }

      // No local pending — use clean SharePoint data
      setEditedRows(data.rows.map(r => [...r]))
      setDirtyKeys(new Set())
      setDeletedRows(new Set())
      setLocalSaveStatus('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [selectedSheet])

  // Auto-save locally whenever edits change
  useEffect(() => {
    autoSaveLocal(editedRows, dirtyKeys, deletedRows)
  }, [editedRows, dirtyKeys, deletedRows, autoSaveLocal])

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

  // Build set of fully-filled sites (all rows have filling=1) for unfilled filter
  const fullyFilledSites = useMemo(() => {
    if (!showUnfilled) return null
    const siteRows = {}
    for (const row of editedRows) {
      const site = String(row[COL.SITE] || '').trim()
      if (!site) continue
      if (!siteRows[site]) siteRows[site] = { total: 0, filled: 0 }
      siteRows[site].total++
      if (Number(row[COL.FILLING]) >= 1) siteRows[site].filled++
    }
    const filled = new Set()
    for (const [site, counts] of Object.entries(siteRows)) {
      if (counts.filled === counts.total) filled.add(site)
    }
    return filled
  }, [editedRows, showUnfilled])

  // Filter rows (use editedRows for display)
  const filteredRows = useMemo(() => {
    if (!showAll && !showUnfilled && !showUnsent && !selectedContractor && !selectedCustomer && !selectedSite) return []

    return editedRows.filter(row => {
      if (!showAll && !showUnfilled && !showUnsent) {
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
      if (showUnfilled && fullyFilledSites) {
        const site = String(row[COL.SITE] || '').trim()
        if (fullyFilledSites.has(site)) return false
      }
      if (showUnsent) {
        const tracking = String(row[COL.TRACKING] || '').trim()
        if (tracking === '1') return false
      }
      return true
    })
  }, [editedRows, selectedContractor, selectedCustomer, selectedSite, activeOnly, showAll, showUnfilled, showUnsent, fullyFilledSites])

  // Totals for displayed (filtered) rows only
  const filteredTotals = useMemo(() => {
    let custTotal = 0
    let contTotal = 0
    for (const row of filteredRows) {
      if (!deletedRows.has(row[COL.ROW_INDEX])) {
        custTotal += Number(row[COL.CUST_TOTAL]) || 0
        contTotal += Number(row[COL.CONT_TOTAL]) || 0
      }
    }
    return { custTotal, contTotal }
  }, [filteredRows, deletedRows])

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

    // Get customer name and number from first row
    const firstRow = siteRows[0]
    const customerName = firstRow ? String(firstRow[COL.CUSTOMER] || '').trim() : ''
    const customerNum = firstRow ? String(firstRow[COL.PRIORITY_NUM] || '').trim() : ''

    return {
      professions,
      totalCustomer,
      totalContractor,
      customerName,
      customerNum,
    }
  }, [editedRows, selectedSite, selectedContractor, selectedCustomer])

  const handleCreateDeliveryNote = async () => {
    if (!siteSummary || !siteSummary.customerNum) {
      alert('לא נמצא מספר לקוח לאתר זה')
      return
    }
    setDeliveryNoteLoading(true)
    try {
      // Ensure parts are loaded for part descriptions
      let parts = arielParts
      if (parts.length === 0) {
        const partsResp = await fetch(`${API_BASE}/api/hr/parts`)
        const partsData = await partsResp.json()
        if (partsData.ok && partsData.parts) {
          parts = partsData.parts
          setArielParts(parts)
        }
      }

      const resp = await fetch(`${API_BASE}/api/hr/delivery-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNum: siteSummary.customerNum,
          customerName: siteSummary.customerName,
          siteName: selectedSite,
          details: `${selectedSite} ${selectedSheet}`,
          items: siteSummary.professions.map(p => {
            // Look up part description from parts list, fallback to profName
            const part = parts.find(ap => ap.code === p.profNum)
            let pdes = part ? part.name : p.profName
            if (p.notes) pdes += ' ' + p.notes
            return {
              profNum: p.profNum,
              profName: pdes,
              hours: p.hoursReg,
              rate: p.custRate,
              total: p.custTotal,
            }
          }),
        }),
      })
      const data = await resp.json()
      if (data.ok) {
        // Load the saved draft
        const noteResp = await fetch(`${API_BASE}/api/hr/delivery-notes/${data.id}`)
        const noteData = await noteResp.json()
        if (noteData.ok) setDeliveryNote(noteData.note)
      } else {
        alert(`שגיאה בפתיחת תעודת משלוח: ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`שגיאה: ${err.message}`)
    } finally {
      setDeliveryNoteLoading(false)
    }
  }

  const handleDnItemChange = (idx, field, value) => {
    if (!deliveryNote) return
    const updated = { ...deliveryNote, items: deliveryNote.items.map((item, i) =>
      i === idx ? { ...item, [field]: field === 'pdes' || field === 'partname' ? value : Number(value) || 0 } : item
    )}
    setDeliveryNote(updated)
  }

  const handleDnDetailsChange = (value) => {
    if (!deliveryNote) return
    setDeliveryNote({ ...deliveryNote, details: value })
  }

  const handleDnSave = async () => {
    if (!deliveryNote) return
    try {
      const resp = await fetch(`${API_BASE}/api/hr/delivery-notes/${deliveryNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: deliveryNote.items, details: deliveryNote.details }),
      })
      const data = await resp.json()
      if (!data.ok) alert(`שגיאה בשמירה: ${data.error}`)
    } catch (err) {
      alert(`שגיאה: ${err.message}`)
    }
  }

  const handleDnSend = async () => {
    if (!deliveryNote) return
    if (!confirm('לשלוח את תעודת המשלוח לפריורטי?')) return
    setDnSending(true)
    try {
      // Save latest changes first
      await fetch(`${API_BASE}/api/hr/delivery-notes/${deliveryNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: deliveryNote.items, details: deliveryNote.details }),
      })
      // Send to Priority
      const resp = await fetch(`${API_BASE}/api/hr/delivery-notes/${deliveryNote.id}/send`, { method: 'POST' })
      const data = await resp.json()
      if (data.ok) {
        setDeliveryNote(prev => ({ ...prev, status: 'sent', docno: data.docno }))
        alert(`תעודת משלוח נשלחה לפריורטי: ${data.docno}`)
      } else {
        alert(`שגיאה בשליחה: ${data.error}`)
      }
    } catch (err) {
      alert(`שגיאה: ${err.message}`)
    } finally {
      setDnSending(false)
    }
  }

  const handleDnDelete = async () => {
    if (!deliveryNote) return
    if (!confirm('למחוק את תעודת המשלוח?')) return
    try {
      await fetch(`${API_BASE}/api/hr/delivery-notes/${deliveryNote.id}`, { method: 'DELETE' })
      setDeliveryNote(null)
    } catch (err) {
      alert(`שגיאה: ${err.message}`)
    }
  }

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
      newRow[COL.FILLING] = 0
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

  // Toggle tracking for all rows of a specific site (also controls green highlight)
  const handleToggleSiteTracking = (site) => {
    const siteRows = editedRows.filter(r => cellVal(r[COL.SITE]) === site)
    const allOn = siteRows.every(r => String(r[COL.TRACKING]) === '1')
    const newVal = allOn ? '0' : '1'
    for (const r of siteRows) {
      handleCellChange(r[COL.ROW_INDEX], COL.TRACKING, newVal)
    }
  }

  const handleToggleSiteFilling = (site) => {
    const siteRows = editedRows.filter(r => cellVal(r[COL.SITE]) === site)
    const allOn = siteRows.every(r => String(r[COL.FILLING]) === '1')
    const newVal = allOn ? '0' : '1'
    for (const r of siteRows) {
      handleCellChange(r[COL.ROW_INDEX], COL.FILLING, newVal)
    }
  }

  // Shared helpers for PDF reports
  const fmtNum = v => {
    const n = Number(v)
    if (!v && v !== 0) return ''
    return isNaN(n) ? String(v) : n.toLocaleString('he-IL', { maximumFractionDigits: 2 })
  }

  const getActiveRows = () =>
    filteredRows.filter(r => !deletedRows.has(r[COL.ROW_INDEX]) && Number(r[COL.HOURS_REG]) > 0)

  const reportStyles = `
    @page { size: landscape; margin: 15mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; direction: rtl; color: #1a1a1a; padding: 0; margin: 0; }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 16px; }
    .header h1 { font-size: 22px; color: #1e3a5f; margin: 0 0 4px; }
    .header .subtitle { font-size: 13px; color: #6b7280; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 16px; color: #2563eb; margin: 0 0 8px; padding: 6px 12px; background: #eff6ff; border-radius: 6px; border-right: 4px solid #2563eb; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1e3a5f; color: #fff; padding: 8px 6px; text-align: right; font-weight: 600; }
    td { padding: 6px; text-align: right; border-bottom: 1px solid #e5e7eb; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr:hover { background: #eff6ff; }
    .num { text-align: left; font-variant-numeric: tabular-nums; }
    .total-row { background: #f0fdf4 !important; border-top: 2px solid #16a34a; }
    .total-row td { padding: 8px 6px; }
    .grand-total { text-align: center; margin-top: 20px; padding: 12px; background: #1e3a5f; color: #fff; border-radius: 8px; font-size: 16px; font-weight: 700; }
    .print-btn { display: block; margin: 24px auto 0; padding: 10px 32px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .print-btn:hover { background: #1d4ed8; }
    @media print { .print-btn { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `

  const openReport = (title, body) => {
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>${title}</title><style>${reportStyles}</style></head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="subtitle">חודש ${selectedSheet} | הופק: ${new Date().toLocaleDateString('he-IL')}</div>
  </div>
  ${body}
  <button class="print-btn" onclick="window.print()">הדפס / שמור כ-PDF</button>
</body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  // Generate contractor PDF report
  const generateContractorReport = () => {
    const rows = getActiveRows()
    if (rows.length === 0) return

    const byContractor = {}
    for (const r of rows) {
      const cont = cellVal(r[COL.CONTRACTOR]) || 'ללא קבלן'
      if (!byContractor[cont]) byContractor[cont] = []
      byContractor[cont].push(r)
    }

    const cols = [
      { key: COL.PRIORITY_NUM, label: 'מס\' לקוח', type: 'text' },
      { key: COL.CUSTOMER, label: 'שם לקוח', type: 'text' },
      { key: COL.SITE, label: 'אתר', type: 'text' },
      { key: COL.PROFESSION_NUM, label: 'מס\' מקצוע', type: 'num' },
      { key: COL.PROFESSION, label: 'מקצוע', type: 'text' },
      { key: COL.TARIFF_TYPE, label: 'סוג תעריף', type: 'text' },
      { key: COL.TARIFF_NOTES, label: 'הערות תעריף', type: 'text' },
      { key: COL.NOTES, label: 'הערות', type: 'text' },
      { key: COL.CONTRACTOR, label: 'כינוי קבלן', type: 'text' },
      { key: COL.HOURS_REG, label: 'שעות רגילות', type: 'num' },
      { key: COL.CONT_RATE, label: 'תעריף קבלן', type: 'num' },
      { key: COL.CONT_TOTAL, label: 'סה"כ לקבלן', type: 'num' },
    ]

    let tablesHtml = ''
    for (const [contractor, cRows] of Object.entries(byContractor)) {
      const total = cRows.reduce((s, r) => s + (Number(r[COL.CONT_TOTAL]) || 0), 0)
      tablesHtml += `
        <div class="section">
          <h2>${contractor}</h2>
          <table>
            <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
            <tbody>
              ${cRows.map(r => `<tr>${cols.map(c =>
                `<td class="${c.type === 'num' ? 'num' : ''}">${c.type === 'num' ? fmtNum(r[c.key]) : cellVal(r[c.key])}</td>`
              ).join('')}</tr>`).join('')}
              <tr class="total-row">
                <td colspan="${cols.length - 1}"><strong>סה"כ ${contractor}</strong></td>
                <td class="num"><strong>${fmtNum(total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>`
    }

    const grandTotal = rows.reduce((s, r) => s + (Number(r[COL.CONT_TOTAL]) || 0), 0)
    tablesHtml += `<div class="grand-total">סה"כ כללי: ${fmtNum(grandTotal)}</div>`

    openReport('דוח קבלן - חברת אריאל', tablesHtml)
  }

  // Generate site PDF report
  const generateSiteReport = () => {
    const rows = getActiveRows()
    if (rows.length === 0) return

    const bySite = {}
    for (const r of rows) {
      const site = cellVal(r[COL.SITE]) || 'ללא אתר'
      if (!bySite[site]) bySite[site] = { customer: cellVal(r[COL.CUSTOMER]), rows: [] }
      bySite[site].rows.push(r)
    }

    const cols = [
      { key: COL.PRIORITY_NUM, label: 'מס\' לקוח', type: 'text' },
      { key: COL.CUSTOMER, label: 'שם לקוח', type: 'text' },
      { key: COL.PROFESSION_NUM, label: 'מס\' מקצוע', type: 'num' },
      { key: COL.PROFESSION, label: 'מקצוע', type: 'text' },
      { key: COL.TARIFF_TYPE, label: 'סוג תעריף', type: 'text' },
      { key: COL.TARIFF_NOTES, label: 'הערות תעריף', type: 'text' },
      { key: COL.NOTES, label: 'הערות', type: 'text' },
      { key: COL.CONTRACTOR, label: 'כינוי קבלן', type: 'text' },
      { key: COL.HOURS_REG, label: 'שעות רגילות', type: 'num' },
      { key: COL.CUST_RATE, label: 'תעריף לקוח', type: 'num' },
      { key: COL.CUST_TOTAL, label: 'סה"כ לקוח', type: 'num' },
      { key: COL.CONT_RATE, label: 'תעריף קבלן', type: 'num' },
      { key: COL.CONT_TOTAL, label: 'סה"כ לקבלן', type: 'num' },
      { key: COL.GAP, label: 'פער', type: 'num' },
    ]

    let tablesHtml = ''
    let grandCustTotal = 0
    let grandContTotal = 0
    let grandGap = 0

    for (const [site, data] of Object.entries(bySite)) {
      const custTotal = data.rows.reduce((s, r) => s + (Number(r[COL.CUST_TOTAL]) || 0), 0)
      const contTotal = data.rows.reduce((s, r) => s + (Number(r[COL.CONT_TOTAL]) || 0), 0)
      const gap = custTotal - contTotal
      grandCustTotal += custTotal
      grandContTotal += contTotal
      grandGap += gap

      tablesHtml += `
        <div class="section">
          <h2>${site} (${data.customer})</h2>
          <table>
            <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
            <tbody>
              ${data.rows.map(r => `<tr>${cols.map(c =>
                `<td class="${c.type === 'num' ? 'num' : ''}">${c.type === 'num' ? fmtNum(r[c.key]) : cellVal(r[c.key])}</td>`
              ).join('')}</tr>`).join('')}
              <tr class="total-row">
                <td colspan="${cols.length - 3}"><strong>סה"כ ${site}</strong></td>
                <td class="num"><strong>${fmtNum(custTotal)}</strong></td>
                <td></td>
                <td class="num"><strong>${fmtNum(contTotal)}</strong></td>
                <td class="num"><strong>${fmtNum(gap)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>`
    }

    tablesHtml += `<div class="grand-total">סה"כ לקוח: ${fmtNum(grandCustTotal)} | סה"כ קבלן: ${fmtNum(grandContTotal)} | פער: ${fmtNum(grandGap)}</div>`

    openReport('דוח אתר - חברת אריאל', tablesHtml)
  }

  // Generate unfilled sites report
  const generateUnfilledReport = () => {
    const allActive = editedRows.filter(r => !deletedRows.has(r[COL.ROW_INDEX]))
    if (allActive.length === 0) return

    // Group by site, find sites with at least one unfilled row
    const bySite = {}
    for (const r of allActive) {
      const site = cellVal(r[COL.SITE]) || 'ללא אתר'
      if (!bySite[site]) bySite[site] = { customer: cellVal(r[COL.CUSTOMER]), rows: [], filledCount: 0 }
      bySite[site].rows.push(r)
      if (Number(r[COL.FILLING]) >= 1) bySite[site].filledCount++
    }

    const unfilledSites = Object.entries(bySite).filter(([, d]) => d.filledCount < d.rows.length)
    if (unfilledSites.length === 0) {
      alert('כל האתרים מולאו!')
      return
    }

    let tablesHtml = `<div class="section"><h2>סה"כ ${unfilledSites.length} אתרים לא מולאו</h2>
      <table>
        <thead><tr><th>#</th><th>שם לקוח</th><th>שם אתר</th></tr></thead>
        <tbody>${unfilledSites.map(([site, d], i) => `<tr>
          <td class="num">${i + 1}</td>
          <td>${d.customer}</td>
          <td>${site}</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`

    openReport('דוח שלא מולאו - חברת אריאל', tablesHtml)
  }

  // Generate unsent sites report
  const generateUnsentReport = () => {
    const allActive = editedRows.filter(r => !deletedRows.has(r[COL.ROW_INDEX]))
    if (allActive.length === 0) return

    const bySite = {}
    for (const r of allActive) {
      const site = cellVal(r[COL.SITE]) || 'ללא אתר'
      if (!bySite[site]) bySite[site] = { customer: cellVal(r[COL.CUSTOMER]), rows: [], sentCount: 0 }
      bySite[site].rows.push(r)
      if (Number(r[COL.TRACKING]) >= 1) bySite[site].sentCount++
    }

    const unsentSites = Object.entries(bySite).filter(([, d]) => d.sentCount < d.rows.length)
    if (unsentSites.length === 0) {
      alert('כל האתרים נשלחו!')
      return
    }

    let tablesHtml = `<div class="section"><h2>סה"כ ${unsentSites.length} אתרים לא נשלחו</h2>
      <table>
        <thead><tr><th>#</th><th>שם לקוח</th><th>שם אתר</th></tr></thead>
        <tbody>${unsentSites.map(([site, d], i) => `<tr>
          <td class="num">${i + 1}</td>
          <td>${d.customer}</td>
          <td>${site}</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`

    openReport('לא נשלחו - חברת אריאל', tablesHtml)
  }

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
      newRows.push({ data: row.slice(0, 24), afterRow })
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
      const data = await safeJson(resp)
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
        setLocalSaveStatus('') // local cleared by backend
      } else {
        setError(data.error || 'שגיאה בשמירה')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const hasFilter = showAll || showUnfilled || showUnsent || selectedContractor || selectedCustomer || selectedSite
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
          <button
            className={`hr-toggle-extra-btn${showArielCustomers ? ' hr-toggle-active' : ''}`}
            disabled={loadingCustomers}
            onClick={() => {
              if (arielCustomers.length === 0) {
                setLoadingCustomers(true)
                fetch(`${API_BASE}/api/hr/customers`)
                  .then(safeJson)
                  .then(data => {
                    if (data.ok) { setArielCustomers(data.customers || []); setShowArielCustomers(true) }
                    else setError(data.error || 'שגיאה בטעינת לקוחות')
                  })
                  .catch(e => setError(e.message))
                  .finally(() => setLoadingCustomers(false))
              } else {
                setShowArielCustomers(v => !v)
              }
            }}
          >
            {loadingCustomers ? 'טוען...' : 'רשימת לקוחות (סניף 102)'}
          </button>
          <button
            className={`hr-toggle-extra-btn${showArielParts ? ' hr-toggle-active' : ''}`}
            disabled={loadingParts}
            onClick={() => {
              if (arielParts.length === 0) {
                setLoadingParts(true)
                fetch(`${API_BASE}/api/hr/parts`)
                  .then(safeJson)
                  .then(data => {
                    if (data.ok) { setArielParts(data.parts || []); setShowArielParts(true) }
                    else setError(data.error || 'שגיאה בטעינת מקטים')
                  })
                  .catch(e => setError(e.message))
                  .finally(() => setLoadingParts(false))
              } else {
                setShowArielParts(v => !v)
              }
            }}
          >
            {loadingParts ? 'טוען...' : 'רשימת מקטים (100-199)'}
          </button>
          {lastSyncTime && (
            <span className="hr-sync-time">סנכרון אחרון: {lastSyncTime}</span>
          )}
        </div>

        {showArielCustomers && arielCustomers.length > 0 && (() => {
          const filtered = customerSearch
            ? arielCustomers.filter(c => c.code.includes(customerSearch) || c.name.includes(customerSearch))
            : arielCustomers
          return (
            <div className="hr-priority-section">
              <div className="hr-priority-header">
                <h3 className="hr-site-summary-title">רשימת לקוחות ({filtered.length})</h3>
                <input
                  className="hr-filter-select"
                  type="text"
                  placeholder="חיפוש לקוח..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  style={{ maxWidth: 200 }}
                />
                <button className="hr-toggle-extra-btn" onClick={() => setShowArielCustomers(false)}>הסתר</button>
              </div>
              <div className="hr-priority-table-wrap" style={{ maxWidth: 500 }}>
                <div className="hr-table-wrapper">
                  <table className="ariel-table hr-summary-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>מספר חשבון</th>
                        <th>שם לקוח</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => (
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
            </div>
          )
        })()}

        {showArielParts && arielParts.length > 0 && (() => {
          const filtered = partSearch
            ? arielParts.filter(p => p.code.includes(partSearch) || p.name.includes(partSearch))
            : arielParts
          return (
            <div className="hr-priority-section">
              <div className="hr-priority-header">
                <h3 className="hr-site-summary-title">רשימת מקטים ({filtered.length})</h3>
                <input
                  className="hr-filter-select"
                  type="text"
                  placeholder="חיפוש מקט..."
                  value={partSearch}
                  onChange={e => setPartSearch(e.target.value)}
                  style={{ maxWidth: 200 }}
                />
                <button className="hr-toggle-extra-btn" onClick={() => setShowArielParts(false)}>הסתר</button>
              </div>
              <div className="hr-priority-table-wrap" style={{ maxWidth: 500 }}>
                <div className="hr-table-wrapper">
                  <table className="ariel-table hr-summary-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>מקט</th>
                        <th>תיאור</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p, i) => (
                        <tr key={p.code}>
                          <td className="ariel-num">{i + 1}</td>
                          <td>{p.code}</td>
                          <td>{p.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })()}

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

        {filteredRows.length > 0 && filteredRows.length !== editedRows.length && (
          <div className="hr-grand-totals" style={{ marginTop: 0 }}>
            <div className="hr-grand-total-item hr-total-income">
              <span className="hr-grand-total-label">סה&quot;כ הכנסות לקוח מוצגות:</span>
              <span className="hr-grand-total-value">{filteredTotals.custTotal.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="hr-grand-total-item hr-total-expense">
              <span className="hr-grand-total-label">סה&quot;כ הוצאות קבלן מוצגות:</span>
              <span className="hr-grand-total-value">{filteredTotals.contTotal.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</span>
            </div>
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
          <button
            className={`hr-toggle-extra-btn${showUnsent ? ' hr-toggle-active' : ''}`}
            onClick={() => { setShowUnsent(v => !v); if (!showUnsent) { setShowAll(true) } }}
          >
            לא נשלחו
          </button>
          {hasFilter && (
            <span className="hr-row-count">{filteredRows.length} שורות</span>
          )}
          <button
            className={`hr-toggle-extra-btn${showUnfilled ? ' hr-toggle-active' : ''}`}
            onClick={() => { setShowUnfilled(v => !v); if (!showUnfilled) { setShowAll(true) } }}
          >
            לא מולאו
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

        {localSaveStatus === 'saved' && !saving && hasDirty && !loading && (
          <div style={{
            padding: '8px 16px', marginBottom: 12, borderRadius: 6,
            background: '#fef3c7', border: '1px solid #fbbf24', fontSize: 13,
            color: '#92400e', direction: 'rtl',
          }}>
            יש שינויים שלא נשמרו ב-SharePoint — לחץ &quot;שמור שינויים&quot; כדי לסנכרן
          </div>
        )}

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
                <>
                  <button
                    className="hr-save-btn"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'שומר...' : `שמור שינויים (${dirtyKeys.size})`}
                  </button>
                  <span className="hr-local-status" style={{
                    fontSize: '12px',
                    color: localSaveStatus === 'saved' ? '#16a34a'
                         : localSaveStatus === 'error' ? '#dc2626'
                         : localSaveStatus === 'saving' ? '#9ca3af' : '#9ca3af',
                  }}>
                    {localSaveStatus === 'saved' && 'נשמר מקומית'}
                    {localSaveStatus === 'saving' && 'שומר מקומית...'}
                    {localSaveStatus === 'error' && 'שגיאה בשמירה מקומית'}
                  </span>
                </>
              )}
            </div>

            {/* Report buttons */}
            {hasFilter && (
              <div className="hr-report-actions">
                <button className="hr-report-btn" onClick={generateContractorReport}>
                  הפק דוח קבלן
                </button>
                <button className="hr-report-btn" onClick={generateSiteReport}>
                  הפק דוח אתר
                </button>
                <button className="hr-report-btn" onClick={generateUnfilledReport}>
                  לא מולאו
                </button>
                <button className="hr-report-btn" onClick={generateUnsentReport}>
                  לא נשלחו
                </button>
              </div>
            )}

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
                            const siteName = cellVal(row[COL.SITE])
                            const siteHighlighted = col.siteCol && Number(row[COL.FILLING]) >= 1
                            const customerTracked = col.idx === COL.CUSTOMER && String(row[COL.TRACKING]) === '1'
                            return (
                              <td key={col.idx} className={`${col.type === 'num' ? 'ariel-num' : ''}${col.tracking ? ' hr-td-tracking' : col.xnarrow ? ' hr-td-xnarrow' : col.narrow ? ' hr-td-narrow' : ''}${col.wide ? ' hr-td-wide' : ''}${col.siteCol ? ' hr-td-site' : ''}${siteHighlighted ? ' hr-cell-active-hours' : ''}${customerTracked ? ' hr-cell-tracked' : ''}`}>
                                {col.tracking && (
                                  <button
                                    className="hr-tracking-toggle-btn"
                                    onClick={() => handleToggleSiteTracking(siteName)}
                                    title="סמן/בטל מעקב לכל האתר"
                                  >&#9998;</button>
                                )}
                                {col.siteCol && (
                                  <button
                                    className="hr-tracking-toggle-btn"
                                    onClick={() => handleToggleSiteFilling(siteName)}
                                    title="סמן/בטל מילוי ורקע ירוק לכל האתר"
                                  >&#9998;</button>
                                )}
                                <input
                                  className={`hr-cell-input${isDirty ? ' hr-cell-dirty' : ''}`}
                                  type="text"
                                  value={cellVal(row[col.idx])}
                                  onChange={e => handleCellChange(excelRow, col.idx, e.target.value)}
                                  onFocus={e => e.target.select()}
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
                {siteSummary.customerName && (
                  <div className="hr-contractor-summary">
                    <span className="hr-summary-label">לקוח:</span>
                    <span className="hr-summary-value">{siteSummary.customerName} ({siteSummary.customerNum})</span>
                  </div>
                )}
                <div className="hr-contractor-summary">
                  <span className="hr-summary-label">סה&quot;כ לקוח:</span>
                  <span className="hr-summary-value">{siteSummary.totalCustomer.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</span>
                  <button
                    className="hr-toggle-extra-btn"
                    style={{ marginRight: '16px' }}
                    disabled={deliveryNoteLoading}
                    onClick={handleCreateDeliveryNote}
                  >
                    {deliveryNoteLoading ? 'פותח תעודה...' : 'פתיחת תעודת משלוח'}
                  </button>
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

                {/* Delivery Note Draft/Sent display */}
                {deliveryNote && (
                  <div className="hr-site-summary" style={{ marginTop: '16px', borderTop: '2px solid #1976d2', paddingTop: '12px' }}>
                    <h3 className="hr-site-summary-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      תעודת משלוח
                      <span style={{
                        fontSize: '13px',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        background: deliveryNote.status === 'sent' ? '#4caf50' : deliveryNote.status === 'error' ? '#f44336' : '#ff9800',
                        color: '#fff',
                      }}>
                        {deliveryNote.status === 'sent' ? `נשלחה לפריורטי (${deliveryNote.docno})` : deliveryNote.status === 'error' ? 'שגיאה' : 'טיוטא'}
                      </span>
                    </h3>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <label style={{ fontWeight: 'bold' }}>פרטים:</label>
                      <input
                        type="text"
                        value={deliveryNote.details || ''}
                        onChange={e => handleDnDetailsChange(e.target.value)}
                        disabled={deliveryNote.status === 'sent'}
                        style={{ flex: 1, minWidth: '200px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
                      />
                      <span style={{ fontSize: '13px', color: '#666' }}>לקוח: {deliveryNote.customer_name} ({deliveryNote.customer_num})</span>
                    </div>

                    <div className="ariel-card hr-table-wrapper">
                      <table className="ariel-table hr-table hr-summary-table">
                        <thead>
                          <tr>
                            <th>מקט</th>
                            <th>תאור מוצר</th>
                            <th>כמות</th>
                            <th>מחיר ליחידה</th>
                            <th>סה&quot;כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveryNote.items.map((item, i) => (
                            <tr key={i}>
                              <td>
                                <input type="text" value={item.partname || ''} onChange={e => handleDnItemChange(i, 'partname', e.target.value)}
                                  disabled={deliveryNote.status === 'sent'} style={{ width: '60px', textAlign: 'center' }} />
                              </td>
                              <td>
                                <input type="text" value={item.pdes || ''} onChange={e => handleDnItemChange(i, 'pdes', e.target.value)}
                                  disabled={deliveryNote.status === 'sent'} style={{ width: '400px' }} />
                              </td>
                              <td>
                                <input type="number" value={item.tquant || 0} onChange={e => handleDnItemChange(i, 'tquant', e.target.value)}
                                  disabled={deliveryNote.status === 'sent'} style={{ width: '70px', textAlign: 'center' }} />
                              </td>
                              <td>
                                <input type="number" value={item.price || 0} onChange={e => handleDnItemChange(i, 'price', e.target.value)}
                                  disabled={deliveryNote.status === 'sent'} style={{ width: '80px', textAlign: 'center' }} />
                              </td>
                              <td style={{ fontWeight: 'bold' }}>
                                {((item.tquant || 0) * (item.price || 0)).toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          <tr className="hr-summary-total-row">
                            <td></td>
                            <td><strong>סה&quot;כ</strong></td>
                            <td><strong>{deliveryNote.items.reduce((s, it) => s + (it.tquant || 0), 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>
                            <td></td>
                            <td><strong>{deliveryNote.items.reduce((s, it) => s + (it.tquant || 0) * (it.price || 0), 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {deliveryNote.status !== 'sent' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button className="hr-toggle-extra-btn" onClick={handleDnSave}>שמור שינויים</button>
                        <button className="hr-toggle-extra-btn" style={{ background: '#4caf50', color: '#fff' }} onClick={handleDnSend} disabled={dnSending}>
                          {dnSending ? 'שולח...' : 'שלח לפריורטי'}
                        </button>
                        <button className="hr-toggle-extra-btn" style={{ background: '#f44336', color: '#fff' }} onClick={handleDnDelete}>מחק</button>
                      </div>
                    )}

                    {deliveryNote.status === 'error' && deliveryNote.error && (
                      <div style={{ color: '#f44336', marginTop: '6px', fontSize: '13px' }}>שגיאה: {deliveryNote.error}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
