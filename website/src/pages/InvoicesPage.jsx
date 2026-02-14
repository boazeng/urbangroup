import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import * as XLSX from 'xlsx'
import './InvoicesPage.css'

// Convert Excel serial number to d.m.yyyy string
// Excel epoch: serial 1 = Jan 1 1900, with a leap-year bug (serial 60 = fake Feb 29 1900)
function excelSerialToDateStr(serial) {
  if (typeof serial !== 'number' || serial < 1) return ''
  const utcEpoch = Date.UTC(1899, 11, 31) // Dec 31, 1899 = serial 0
  const days = serial >= 61 ? serial - 1 : serial
  const d = new Date(utcEpoch + days * 86400000)
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        // Do NOT use cellDates — SheetJS date conversion can be wrong.
        // Dates stay as Excel serial numbers; we convert them ourselves.
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
        resolve(raw)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'))
    reader.readAsArrayBuffer(file)
  })
}

function validateFile(rows) {
  const errors = []
  const toStr = (v) => (v == null ? '' : String(v))

  if (rows.length < 2) {
    errors.push('הקובץ ריק או שאין בו שורות נתונים')
    return { valid: false, errors, headers: [], dataRows: [], dataCount: 0 }
  }

  // Find header row and column offset dynamically
  // The first header "מס" can be at different positions depending on SheetJS range handling
  let headerRowIdx = -1
  let colStart = 0

  for (let ri = 0; ri < Math.min(3, rows.length); ri++) {
    const row = rows[ri]
    if (!row) continue
    for (let ci = 0; ci < Math.min(5, row.length); ci++) {
      const val = (row[ci] || '').toString().trim()
      if (val.startsWith('מס')) {
        headerRowIdx = ri
        colStart = ci
        break
      }
    }
    if (headerRowIdx >= 0) break
  }

  if (headerRowIdx < 0) {
    errors.push('לא נמצאה שורת כותרות — ודא שהקובץ בפורמט הנכון')
    return { valid: false, errors, headers: [], dataRows: [], dataCount: 0 }
  }

  const headerRow = rows[headerRowIdx]
  const headers = headerRow.slice(colStart).map((h) => (h || '').toString().trim())

  // Build column index map from headers dynamically
  // This handles files with or without optional columns like "תאור מוצר"
  const findCol = (keyword) => headers.findIndex((h) => h.includes(keyword))

  const colIdx = {
    rowNum: findCol('מס'),
    date: findCol('תאריך'),
    details: findCol('פרטים'),
    branch: findCol('סניף'),
    custname: findCol('מספר לקוח'),
    custLabel: findCol('שם לקוח'),
    partname: findCol('מקט'),
    partDesc: findCol('תאור'),
    quantity: findCol('כמות'),
    priceNoVat: findCol('לפני'),
    priceWithVat: findCol('כולל'),
  }

  // Debug: log detected headers and column mapping
  console.log('Headers detected:', JSON.stringify(headers))
  console.log('Column index map:', JSON.stringify(colIdx))

  // Check required columns exist
  const REQUIRED = { 'מספר לקוח': colIdx.custname, 'מקט': colIdx.partname }
  const missingCols = Object.entries(REQUIRED).filter(([, idx]) => idx < 0).map(([name]) => name)
  if (missingCols.length > 0) {
    errors.push(`עמודות חובה חסרות: ${missingCols.join(', ')}`)
  }
  if (colIdx.priceNoVat < 0 && colIdx.priceWithVat < 0) {
    errors.push('חסרה עמודת סכום (לפני מעמ או כולל מעמ)')
  }

  // Cell accessor: gets value from row by header-mapped index
  const getCell = (row, key) => {
    const idx = colIdx[key]
    return idx >= 0 ? row[colStart + idx] : null
  }

  // Parse data rows (starting from row after headers)
  const dataRows = []
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const custname = getCell(row, 'custname')
    if (!custname) continue

    const dateVal = getCell(row, 'date')
    if (i === headerRowIdx + 1) {
      console.log('Raw date value:', dateVal, '| type:', typeof dateVal, '| converted:', excelSerialToDateStr(dateVal))
    }
    // dateVal is an Excel serial number (e.g. 46053) since we read without cellDates
    const dateStr = typeof dateVal === 'number'
      ? excelSerialToDateStr(dateVal)
      : dateVal ? String(dateVal) : ''

    const qtyVal = getCell(row, 'quantity')
    const noVat = getCell(row, 'priceNoVat')
    const withVat = getCell(row, 'priceWithVat')

    dataRows.push({
      rowNum: toStr(getCell(row, 'rowNum')) || String(i),
      date: dateStr,
      details: toStr(getCell(row, 'details')),
      branch: toStr(getCell(row, 'branch')) || '000',
      custname: String(custname),
      custLabel: toStr(getCell(row, 'custLabel')),
      partname: toStr(getCell(row, 'partname')),
      partDesc: toStr(getCell(row, 'partDesc')),
      quantity: qtyVal != null ? Number(qtyVal) || 1 : 1,
      priceNoVat: noVat != null ? Number(noVat) : null,
      priceWithVat: withVat != null ? Number(withVat) : null,
    })
  }

  if (dataRows.length > 0) {
    console.log('First row:', JSON.stringify(dataRows[0]))
  }

  if (dataRows.length === 0) {
    errors.push('לא נמצאו שורות נתונים בקובץ')
  }

  // Validate individual rows
  const rowErrors = []
  dataRows.forEach((r, i) => {
    if (!r.custname) rowErrors.push(`שורה ${r.rowNum || i + 1}: חסר מספר לקוח`)
    if (!r.partname) rowErrors.push(`שורה ${r.rowNum || i + 1}: חסר מקט`)
    if (!r.priceNoVat && !r.priceWithVat) rowErrors.push(`שורה ${r.rowNum || i + 1}: חסר סכום`)
  })

  if (rowErrors.length > 0 && rowErrors.length <= 3) {
    errors.push(...rowErrors)
  } else if (rowErrors.length > 3) {
    errors.push(...rowErrors.slice(0, 3))
    errors.push(`ועוד ${rowErrors.length - 3} שגיאות...`)
  }

  return {
    valid: errors.length === 0,
    errors,
    headers,
    dataRows,
    dataCount: dataRows.length,
    hasPartDesc: colIdx.partDesc >= 0,
  }
}

export default function InvoicesPage() {
  const { env } = useEnv()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null) // { valid, errors, headers, dataRows, dataCount }
  const [parsing, setParsing] = useState(false)
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [results, setResults] = useState(null)
  const [customerMap, setCustomerMap] = useState(null) // { "1001": "TLG", ... }
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState(null)
  const [finalize, setFinalize] = useState(true)
  const fileInputRef = useRef(null)

  // Fetch customer list from Priority on mount
  useEffect(() => {
    setCustomerLoading(true)
    fetch(`/api/customers?env=${env}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          const map = {}
          data.customers.forEach((c) => { map[c.CUSTNAME] = c.CUSTDES })
          setCustomerMap(map)
        } else {
          setCustomerError(data.error || 'שגיאה בטעינת לקוחות')
        }
      })
      .catch(() => {
        setCustomerError('לא ניתן להתחבר לשרת — הפעל את backend/server.py')
      })
      .finally(() => setCustomerLoading(false))
  }, [env])

  const processFile = async (f) => {
    setFile(f)
    setStatus('idle')
    setResults(null)
    setParsing(true)
    try {
      const rows = await parseExcelFile(f)
      const validation = validateFile(rows)
      setPreview(validation)
    } catch {
      setPreview({ valid: false, errors: ['שגיאה בקריאת הקובץ — ודא שזהו קובץ Excel תקין'], headers: [], dataRows: [], dataCount: 0 })
    } finally {
      setParsing(false)
    }
  }

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (selected) processFile(selected)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('inv-dropzone-active')
    const dropped = e.dataTransfer.files[0]
    if (dropped && dropped.name.endsWith('.xlsx')) processFile(dropped)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add('inv-dropzone-active')
  }

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('inv-dropzone-active')
  }

  const handleRemoveFile = () => {
    setFile(null)
    setPreview(null)
    setStatus('idle')
    setResults(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRun = async () => {
    if (!file || !preview?.valid) return
    setStatus('running')
    setResults(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('finalize', finalize ? '1' : '0')

      const res = await fetch(`/api/invoices/run?env=${env}`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!data.ok) {
        setStatus('error')
        setResults({ error: data.error, total: 0, success: 0, failed: 0, invoices: [] })
        return
      }

      setResults({
        total: data.total,
        success: data.success,
        failed: data.failed,
        invoices: data.invoices.map((inv) => ({
          row: inv.row,
          customer: inv.customer,
          name: inv.name,
          status: inv.status,
          ivnum: inv.ivnum || null,
          priceNoVat: inv.totprice ? +(inv.totprice / 1.18).toFixed(2) : 0,
          priceWithVat: inv.totprice || 0,
          finalized: inv.finalized || false,
          finalizeError: inv.finalize_error || null,
          error: inv.error || null,
        })),
      })
      setStatus('done')
    } catch {
      setStatus('error')
      setResults({ error: 'שגיאה בתקשורת עם השרת — ודא שהשרת פועל', total: 0, success: 0, failed: 0, invoices: [] })
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatPrice = (val) => {
    if (val == null) return '—'
    return `₪${Number(val).toFixed(2)}`
  }

  return (
    <div className="inv-page">
      <div className="container">
        <Link to="/app/urban-energy" className="inv-back">← חזרה לאנרגיה אורבנית</Link>

        <div className="inv-header">
          <span className="inv-header-icon">📄</span>
          <div>
            <h1 className="inv-title">הפקת חשבוניות לקוח</h1>
            <p className="inv-subtitle">
              הפקת חשבוניות עמלת גבייה מתוך קובץ Excel דרך מערכת פריוריטי
            </p>
          </div>
          <a href="/api/template" download className="inv-template-btn">
            הורדת קובץ טמפלט
          </a>
        </div>

        {/* Upload */}
        <div className="inv-card">
          <h2 className="inv-card-title">העלאת קובץ</h2>

          {!file ? (
            <div
              className="inv-dropzone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="inv-dropzone-icon">📊</span>
              <p className="inv-dropzone-text">גרור קובץ Excel לכאן או לחץ לבחירה</p>
              <p className="inv-dropzone-hint">קבצי .xlsx בלבד</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="inv-file-input"
              />
            </div>
          ) : (
            <div className="inv-file-info">
              <span className="inv-file-icon">📊</span>
              <div className="inv-file-details">
                <p className="inv-file-name">{file.name}</p>
                <p className="inv-file-desc">{formatSize(file.size)}</p>
              </div>
              <button className="inv-file-remove" onClick={handleRemoveFile} title="הסר קובץ">✕</button>
            </div>
          )}

          {parsing && (
            <div className="inv-progress">
              <div className="inv-spinner" />
              <span>קורא את הקובץ...</span>
            </div>
          )}
        </div>

        {/* Preview & Validation */}
        {preview && !parsing && (
          <div className="inv-card">
            <div className="inv-validation-header">
              <h2 className="inv-card-title">
                {preview.valid ? 'תצוגה מקדימה' : 'בדיקת קובץ'}
              </h2>
              {preview.valid ? (
                <span className="inv-status inv-status-ok">הקובץ תקין — {preview.dataCount} חשבוניות</span>
              ) : (
                <span className="inv-status inv-status-err">נמצאו בעיות בקובץ</span>
              )}
            </div>

            {customerLoading && (
              <div className="inv-progress">
                <div className="inv-spinner" />
                <span>טוען רשימת לקוחות מפריוריטי...</span>
              </div>
            )}
            {customerError && (
              <div className="inv-customer-warning">
                <span className="inv-error-icon">!</span>
                <span>{customerError}</span>
              </div>
            )}

            {preview.errors.length > 0 && (
              <div className="inv-errors">
                {preview.errors.map((err, i) => (
                  <div key={i} className="inv-error-item">
                    <span className="inv-error-icon">!</span>
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {preview.valid && (
              <div className="inv-actions inv-actions-top">
                <button
                  className="inv-run-btn"
                  onClick={handleRun}
                  disabled={status === 'running'}
                >
                  {status === 'running' ? 'מפיק חשבוניות...' : `הפקת ${preview.dataCount} חשבוניות`}
                </button>
                <label className="inv-finalize-toggle">
                  <input
                    type="checkbox"
                    checked={finalize}
                    onChange={(e) => setFinalize(e.target.checked)}
                    disabled={status === 'running'}
                  />
                  <span className="inv-finalize-label">סגירת חשבוניות</span>
                </label>
                {status === 'running' && (
                  <div className="inv-progress">
                    <div className="inv-spinner" />
                    <span>מעבד חשבוניות מול פריוריטי...</span>
                  </div>
                )}
              </div>
            )}

            {preview.dataRows.length > 0 && (
              <>
                <div className="inv-preview-table-wrap">
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>תאריך</th>
                        <th>פרטים</th>
                        <th>סניף</th>
                        <th>מס׳ לקוח</th>
                        <th>שם לקוח</th>
                        <th className="inv-th-priority">שם בפריוריטי</th>
                        <th>מקט</th>
                        {preview.hasPartDesc && <th>תאור מוצר</th>}
                        <th>כמות</th>
                        <th>סכום לפני מע"מ</th>
                        <th>סכום כולל מע"מ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.dataRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.rowNum || i + 1}</td>
                          <td>{r.date}</td>
                          <td>{r.details}</td>
                          <td>{r.branch}</td>
                          <td>{r.custname}</td>
                          <td>{r.custLabel}</td>
                          <td className={
                            customerMap
                              ? customerMap[r.custname]
                                ? customerMap[r.custname].trim().replace(/\s+/g, ' ') === r.custLabel.trim().replace(/\s+/g, ' ')
                                  ? 'inv-cell-priority-ok'
                                  : 'inv-cell-priority-warn'
                                : 'inv-cell-priority-err'
                              : ''
                          }>
                            {customerMap
                              ? customerMap[r.custname]
                                ? customerMap[r.custname].trim().replace(/\s+/g, ' ') === r.custLabel.trim().replace(/\s+/g, ' ')
                                  ? customerMap[r.custname]
                                  : `${customerMap[r.custname]} ⚠`
                                : 'לא נמצא!'
                              : customerLoading ? '...' : '—'
                            }
                          </td>
                          <td>{r.partname}</td>
                          {preview.hasPartDesc && <td className="inv-cell-desc">{r.partDesc}</td>}
                          <td>{r.quantity}</td>
                          <td>{formatPrice(r.priceNoVat)}</td>
                          <td>{formatPrice(r.priceWithVat)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="inv-preview-more">{preview.dataCount} שורות</p>
              </>
            )}

          </div>
        )}

        {/* Error */}
        {results?.error && status === 'error' && (
          <div className="inv-card">
            <div className="inv-errors">
              <div className="inv-error-item">
                <span className="inv-error-icon">!</span>
                <span>{results.error}</span>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && status === 'done' && (
          <div className="inv-results">
            <h2 className="inv-card-title">תוצאות</h2>
            <div className="inv-summary">
              <div className="inv-summary-item inv-summary-ok">
                <span className="inv-summary-value">{results.success}</span>
                <span className="inv-summary-label">הצליחו</span>
              </div>
              <div className="inv-summary-item inv-summary-fail">
                <span className="inv-summary-value">{results.failed}</span>
                <span className="inv-summary-label">נכשלו</span>
              </div>
              <div className="inv-summary-item">
                <span className="inv-summary-value">{results.total}</span>
                <span className="inv-summary-label">סה"כ</span>
              </div>
            </div>

            <table className="inv-table">
              <thead>
                <tr>
                  <th>שורה</th>
                  <th>מס׳ לקוח</th>
                  <th>שם לקוח</th>
                  <th>סטטוס</th>
                  <th>חשבונית</th>
                  <th>סגירה</th>
                  <th>לפני מע"מ</th>
                  <th>כולל מע"מ</th>
                </tr>
              </thead>
              <tbody>
                {results.invoices.map((inv) => (
                  <tr key={inv.row} className={inv.status === 'FAILED' ? 'inv-row-failed' : ''}>
                    <td>{inv.row}</td>
                    <td>{inv.customer}</td>
                    <td>{inv.name}</td>
                    <td>
                      {inv.status === 'OK'
                        ? <span className="inv-badge inv-badge-ok">OK</span>
                        : <span className="inv-badge inv-badge-err" title={inv.error}>נכשל</span>
                      }
                    </td>
                    <td>{inv.ivnum ? <span className="inv-badge">{inv.ivnum}</span> : '—'}</td>
                    <td>
                      {inv.status === 'FAILED' ? '—'
                        : inv.finalized
                          ? <span className="inv-badge inv-badge-ok">סופית</span>
                          : inv.finalizeError
                            ? <span className="inv-badge inv-badge-err" title={inv.finalizeError}>נכשל</span>
                            : <span className="inv-badge">טיוטא</span>
                      }
                    </td>
                    <td>{formatPrice(inv.priceNoVat)}</td>
                    <td>{formatPrice(inv.priceWithVat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
