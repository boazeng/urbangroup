import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import './ArielPage.css'
import './SupplierInvoicesPage.css'

const COLUMNS = [
  { key: 'num', label: 'מס' },
  { key: 'filename', label: 'שם קובץ' },
  { key: 'page', label: 'עמוד' },
  { key: 'supplier', label: 'מספר ספק' },
  { key: 'date', label: 'תאריך' },
  { key: 'invoiceNum', label: 'מספר חשבונית' },
  { key: 'branch', label: 'סניף' },
  { key: 'details', label: 'פרטים' },
  { key: 'allocation', label: 'מספר הקצאה' },
  { key: 'sku', label: 'מקט' },
  { key: 'description', label: 'תאור המוצר' },
  { key: 'account', label: 'חשבון' },
  { key: 'amountNoVat', label: 'לפני מע"מ', numeric: true },
  { key: 'amountWithVat', label: 'כולל מע"מ', numeric: true },
]

function excelSerialToDateStr(serial) {
  if (typeof serial !== 'number' || serial < 1) return ''
  const utcEpoch = Date.UTC(1899, 11, 31)
  const days = serial >= 61 ? serial - 1 : serial
  const d = new Date(utcEpoch + days * 86400000)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

function formatDate(val) {
  if (!val) return ''
  if (typeof val === 'number') return excelSerialToDateStr(val)
  const s = String(val)
  if (s.includes('T')) return s.slice(0, 10)
  return s
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
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

function parseRows(raw) {
  // Find header row containing 'מס'
  let headerIdx = -1
  let colStart = 0
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const row = raw[i] || []
    for (let j = 0; j < row.length; j++) {
      if (String(row[j] || '').trim() === 'מס') {
        headerIdx = i
        colStart = j
        break
      }
    }
    if (headerIdx >= 0) break
  }

  if (headerIdx < 0) return { rows: [], error: 'לא נמצאה שורת כותרות (מס) בקובץ' }

  const dataRows = []
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i] || []
    const c = (idx) => r[colStart + idx] ?? ''

    // Skip empty rows
    if (!c(0) && !c(5)) continue

    const amountWithVat = parseFloat(c(13)) || 0
    const amountNoVat = parseFloat(c(12)) || (amountWithVat ? Math.round(amountWithVat / 1.18 * 100) / 100 : 0)

    dataRows.push({
      num: c(0),
      filename: c(1),
      page: c(2),
      supplier: c(3),
      date: formatDate(c(4)),
      invoiceNum: c(5),
      branch: c(6),
      details: c(7),
      allocation: c(8),
      sku: c(9),
      description: c(10),
      account: c(11),
      amountNoVat,
      amountWithVat,
    })
  }

  return { rows: dataRows, error: null }
}

function formatCurrency(num) {
  if (!num) return '-'
  return num.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SupplierInvoicesPage() {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  async function handleFile(file) {
    if (!file) return
    setError(null)
    setFileName(file.name)
    try {
      const raw = await parseExcel(file)
      const { rows: parsed, error: parseError } = parseRows(raw)
      if (parseError) {
        setError(parseError)
        setRows([])
      } else {
        setRows(parsed)
      }
    } catch (e) {
      setError('שגיאה בקריאת הקובץ: ' + e.message)
      setRows([])
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onDragOver(e) {
    e.preventDefault()
    setDragging(true)
  }

  const totalNoVat = rows.reduce((s, r) => s + (r.amountNoVat || 0), 0)
  const totalWithVat = rows.reduce((s, r) => s + (r.amountWithVat || 0), 0)

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/apps" className="ariel-back">&rarr; חזרה לאפליקציות</Link>

        <h1 className="ariel-title">קליטת חשבוניות ספק</h1>

        <div
          className={`sup-dropzone${dragging ? ' sup-dropzone-active' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <span className="sup-dropzone-icon">📥</span>
          <span className="sup-dropzone-text">
            {fileName || 'גרור קובץ אקסל לכאן או לחץ לבחירה'}
          </span>
          {fileName && <span className="sup-dropzone-hint">לחץ להחלפת קובץ</span>}
        </div>

        {error && <div className="ariel-error">{error}</div>}

        {rows.length > 0 && (
          <div className="ariel-report">
            <div className="ariel-report-header">
              <span className="ariel-report-meta">
                {rows.length} חשבוניות | סה״כ לפני מע״מ {formatCurrency(totalNoVat)} ₪ | סה״כ כולל מע״מ {formatCurrency(totalWithVat)} ₪
              </span>
              <button className="ariel-print-btn" onClick={() => window.print()}>
                הדפסה
              </button>
            </div>

            <div className="ariel-card">
              <table className="ariel-table sup-table">
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} className={col.numeric ? 'ariel-num' : ''}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      {COLUMNS.map((col) => (
                        <td key={col.key} className={col.numeric ? 'ariel-num' : ''}>
                          {col.numeric ? formatCurrency(row[col.key]) : (row[col.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="ariel-totals-row">
                    <td colSpan={12} className="ariel-totals-label">סה״כ</td>
                    <td className="ariel-num">{formatCurrency(totalNoVat)}</td>
                    <td className="ariel-num">{formatCurrency(totalWithVat)}</td>
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
