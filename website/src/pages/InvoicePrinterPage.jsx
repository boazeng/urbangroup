import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import './ArielPage.css'
import './SupplierInvoicesPage.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

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

function extractInvoiceNumbers(raw) {
  const numbers = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] || []
    for (let j = 0; j < row.length; j++) {
      const val = String(row[j] || '').trim()
      if (val && /\d/.test(val) && val.length >= 3) {
        numbers.push(val)
      }
    }
  }
  // Deduplicate
  return [...new Set(numbers)]
}

export default function InvoicePrinterPage() {
  const [invoices, setInvoices] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [statuses, setStatuses] = useState({})
  const inputRef = useRef()

  async function handleFile(file) {
    if (!file) return
    setError(null)
    setFileName(file.name)
    setStatuses({})
    try {
      const raw = await parseExcel(file)
      const numbers = extractInvoiceNumbers(raw)
      if (numbers.length === 0) {
        setError('לא נמצאו מספרי חשבוניות בקובץ')
        setInvoices([])
      } else {
        setInvoices(numbers.map((num, idx) => ({ id: idx + 1, ivnum: num })))
      }
    } catch (e) {
      setError('שגיאה בקריאת הקובץ: ' + e.message)
      setInvoices([])
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

  async function handleDownloadAll() {
    if (invoices.length === 0 || downloading) return
    setDownloading(true)

    for (const inv of invoices) {
      setStatuses((prev) => ({ ...prev, [inv.ivnum]: 'downloading' }))
      try {
        const res = await fetch(`${API_BASE}/api/invoice-printer/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ivnum: inv.ivnum }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${res.status}`)
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${inv.ivnum}.pdf`
        a.click()
        URL.revokeObjectURL(url)
        setStatuses((prev) => ({ ...prev, [inv.ivnum]: 'done' }))
      } catch (e) {
        setStatuses((prev) => ({ ...prev, [inv.ivnum]: `error: ${e.message}` }))
      }
    }

    setDownloading(false)
  }

  const hasFile = invoices.length > 0

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/apps" className="ariel-back">&rarr; חזרה לאפליקציות</Link>

        <h1 className="ariel-title">הדפסת חשבוניות מס</h1>

        {!hasFile ? (
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
            <span className="sup-dropzone-icon">📄</span>
            <span className="sup-dropzone-text">גרור קובץ אקסל עם מספרי חשבוניות או לחץ לבחירה</span>
          </div>
        ) : (
          <div className="sup-file-bar">
            <span className="sup-file-name">{fileName}</span>
            <button className="sup-file-change" onClick={() => inputRef.current?.click()}>
              החלף קובץ
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        )}

        {error && <div className="ariel-error">{error}</div>}

        {hasFile && (
          <div className="ariel-report">
            <div className="ariel-report-header">
              <span className="ariel-report-meta">
                {invoices.length} חשבוניות
              </span>
              <button
                className="ariel-print-btn"
                onClick={handleDownloadAll}
                disabled={downloading}
              >
                {downloading ? 'מוריד...' : 'הורדת חשבוניות'}
              </button>
            </div>

            <div className="ariel-card">
              <table className="ariel-table sup-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>מספר חשבונית</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const status = statuses[inv.ivnum]
                    let statusText = ''
                    let statusClass = ''
                    if (status === 'downloading') {
                      statusText = 'מוריד...'
                      statusClass = 'ariel-status-pending'
                    } else if (status === 'done') {
                      statusText = 'הורד בהצלחה'
                      statusClass = 'ariel-status-success'
                    } else if (status?.startsWith('error')) {
                      statusText = status.replace('error: ', 'שגיאה: ')
                      statusClass = 'ariel-status-error'
                    }
                    return (
                      <tr key={inv.id}>
                        <td>{inv.id}</td>
                        <td style={{ direction: 'ltr', textAlign: 'center' }}>{inv.ivnum}</td>
                        <td className={statusClass}>{statusText}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
