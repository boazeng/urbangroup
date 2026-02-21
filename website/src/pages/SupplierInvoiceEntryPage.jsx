import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './ArielPage.css'
import './SupplierInvoiceEntryPage.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

function emptyInvoice() {
  return {
    supplier: '',
    supplierName: '',
    date: '',
    invoiceNum: '',
    branch: '',
    details: '',
    uniqueId: '',
    items: [emptyItem()],
  }
}

function emptyItem() {
  return { partname: '', description: '', account: '', amountNoVat: '', amountWithVat: '' }
}

export default function SupplierInvoiceEntryPage() {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [pdfName, setPdfName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiError, setAiError] = useState(null)
  const inputRef = useRef()
  const canvasRef = useRef()
  const fileRef = useRef(null) // keep file reference for AI upload

  const invoice = invoices[currentIdx]

  // Render the current page to canvas
  const renderPage = useCallback(async (doc, pageNum) => {
    if (!doc || !canvasRef.current) return
    setRendering(true)
    try {
      const page = await doc.getPage(pageNum)
      const canvas = canvasRef.current
      const containerWidth = canvas.parentElement?.clientWidth || 600
      const unscaledViewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / unscaledViewport.width
      const viewport = page.getViewport({ scale })

      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise
    } finally {
      setRendering(false)
    }
  }, [])

  // Re-render when navigating
  useEffect(() => {
    if (pdfDoc && pageCount > 0) {
      const pageNum = Math.min(currentIdx + 1, pageCount)
      renderPage(pdfDoc, pageNum)
    }
  }, [pdfDoc, currentIdx, pageCount, renderPage])

  async function handleFile(file) {
    if (!file) return
    const buf = await file.arrayBuffer()
    const doc = await pdfjsLib.getDocument({ data: buf }).promise
    const numPages = doc.numPages

    // Set state immediately so the UI renders
    const initialInvoices = Array.from({ length: numPages }, () => emptyInvoice())
    setPdfDoc(doc)
    setPageCount(numPages)
    setPdfName(file.name)
    setInvoices(initialInvoices)
    setCurrentIdx(0)
    setAiError(null)
    fileRef.current = file

    // Send PDF to Claude AI for analysis
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/analyze-invoice', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (data.ok && data.invoices) {
        setInvoices(prev => {
          const copy = [...prev]
          for (const inv of data.invoices) {
            const pageIdx = (inv.pages?.[0] || 1) - 1
            if (pageIdx < copy.length) {
              copy[pageIdx] = {
                ...copy[pageIdx],
                uniqueId: inv.companyId || '',
                supplier: inv.supplier || '',
                supplierName: inv.supplierName || '',
                invoiceNum: inv.invoiceNum || '',
                date: inv.date || '',
                details: inv.description || '',
                items: [{
                  ...copy[pageIdx].items[0],
                  amountNoVat: inv.amountNoVat || '',
                  amountWithVat: inv.amountWithVat || '',
                }],
              }
              // Mark continuation pages
              if (inv.pages?.length > 1) {
                for (let p = 1; p < inv.pages.length; p++) {
                  const contIdx = inv.pages[p] - 1
                  if (contIdx < copy.length) {
                    copy[contIdx] = {
                      ...copy[contIdx],
                      details: `(המשך חשבונית מעמוד ${inv.pages[0]})`,
                    }
                  }
                }
              }
            }
          }
          return copy
        })
      } else if (data.error) {
        setAiError(data.error)
      }
    } catch (err) {
      console.error('AI analysis failed:', err)
      setAiError('שגיאה בחיבור לשרת')
    } finally {
      setAnalyzing(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  function updateInvoice(field, value) {
    setInvoices(prev => {
      const copy = [...prev]
      copy[currentIdx] = { ...copy[currentIdx], [field]: value }
      return copy
    })
  }

  function updateItem(itemIdx, field, value) {
    setInvoices(prev => {
      const copy = [...prev]
      const items = [...copy[currentIdx].items]
      items[itemIdx] = { ...items[itemIdx], [field]: value }
      copy[currentIdx] = { ...copy[currentIdx], items }
      return copy
    })
  }

  function addItem() {
    setInvoices(prev => {
      const copy = [...prev]
      copy[currentIdx] = {
        ...copy[currentIdx],
        items: [...copy[currentIdx].items, emptyItem()],
      }
      return copy
    })
  }

  function removeItem(itemIdx) {
    if (invoice.items.length <= 1) return
    setInvoices(prev => {
      const copy = [...prev]
      const items = copy[currentIdx].items.filter((_, i) => i !== itemIdx)
      copy[currentIdx] = { ...copy[currentIdx], items }
      return copy
    })
  }

  function goTo(idx) {
    if (idx >= 0 && idx < invoices.length) setCurrentIdx(idx)
  }

  // Save supplier mapping when user confirms a supplier code for a known ח.פ.
  async function saveSupplierMapping(companyId, supname, supdes) {
    if (!companyId || !supname) return
    try {
      await fetch('/api/supplier-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, supname, supdes }),
      })
    } catch (err) {
      console.error('Failed to save supplier mapping:', err)
    }
  }

  // When supplier field loses focus, save the mapping if we have both ח.פ. and supplier code
  function onSupplierBlur() {
    if (invoice?.uniqueId && invoice?.supplier) {
      saveSupplierMapping(invoice.uniqueId, invoice.supplier, invoice.supplierName || '')
    }
  }

  const totalNoVat = invoice ? invoice.items.reduce((s, it) => s + (parseFloat(it.amountNoVat) || 0), 0) : 0
  const totalWithVat = invoice ? invoice.items.reduce((s, it) => s + (parseFloat(it.amountWithVat) || 0), 0) : 0

  // Count how many fields were auto-detected for current invoice
  const autoFields = invoice ? [invoice.uniqueId, invoice.invoiceNum, invoice.date].filter(Boolean).length : 0

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/apps" className="ariel-back">&rarr; חזרה לאפליקציות</Link>
        <h1 className="ariel-title">הזנת חשבוניות ספק</h1>

        {/* PDF Upload */}
        {!pdfDoc ? (
          <div
            className={`sup-dropzone${dragging ? ' sup-dropzone-active' : ''}`}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <span className="sup-dropzone-icon">📄</span>
            <span className="sup-dropzone-text">גרור קובץ PDF עם חשבוניות לכאן או לחץ לבחירה</span>
          </div>
        ) : invoice && (
          /* Split layout: PDF + Form */
          <div className="sie-split">
            {/* PDF Viewer */}
            <div className="sie-pdf-panel">
              <div className="sie-pdf-bar">
                <span className="sie-pdf-name">{pdfName}</span>
                <span className="sie-pdf-pages">עמוד {currentIdx + 1} מתוך {pageCount}</span>
                <button className="sup-file-change" onClick={() => inputRef.current?.click()}>
                  החלף קובץ
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>
              <div className="sie-canvas-wrap">
                <canvas ref={canvasRef} className="sie-canvas" />
                {rendering && <div className="sie-canvas-loading"><div className="ariel-spinner" /></div>}
              </div>
            </div>

            {/* Invoice Form */}
            <div className="sie-form-panel">
              {/* Navigation */}
              <div className="sie-nav">
                <button className="sie-nav-btn" disabled={currentIdx === 0} onClick={() => goTo(currentIdx - 1)}>
                  הקודם &rarr;
                </button>
                <span className="sie-nav-counter">
                  חשבונית {currentIdx + 1} מתוך {invoices.length}
                </span>
                <button className="sie-nav-btn" disabled={currentIdx === invoices.length - 1} onClick={() => goTo(currentIdx + 1)}>
                  &larr; הבא
                </button>
                {analyzing && (
                  <span className="sie-analyzing">
                    <span className="ariel-spinner" style={{width: 16, height: 16}} />
                    מנתח חשבוניות עם AI...
                  </span>
                )}
                {!analyzing && autoFields > 0 && (
                  <span className="sie-auto-badge">AI: זוהו {autoFields} שדות</span>
                )}
                {aiError && (
                  <span className="sie-ai-error" title={aiError}>
                    {aiError.length > 50 ? aiError.slice(0, 50) + '...' : aiError}
                  </span>
                )}
              </div>

              {/* Header fields */}
              <div className="sie-fields">
                <div className="sie-field">
                  <label>
                    מספר ספק
                    {invoice.supplier && invoice.supplierName && <span className="sie-auto-badge">AI</span>}
                  </label>
                  <input type="text" value={invoice.supplier} onChange={e => updateInvoice('supplier', e.target.value)} onBlur={onSupplierBlur} placeholder="לדוגמה: 60471" />
                  {invoice.supplierName && (
                    <span className="sie-supplier-name">{invoice.supplierName}</span>
                  )}
                </div>
                <div className="sie-field">
                  <label>
                    תאריך חשבונית
                    {invoice.date && <span className="sie-auto-badge">AI</span>}
                  </label>
                  <input type="date" value={invoice.date} onChange={e => updateInvoice('date', e.target.value)} />
                </div>
                <div className="sie-field">
                  <label>
                    מספר חשבונית ספק
                    {invoice.invoiceNum && <span className="sie-auto-badge">AI</span>}
                  </label>
                  <input type="text" value={invoice.invoiceNum} onChange={e => updateInvoice('invoiceNum', e.target.value)} placeholder="BOOKNUM" />
                </div>
                <div className="sie-field">
                  <label>סניף</label>
                  <input type="text" value={invoice.branch} onChange={e => updateInvoice('branch', e.target.value)} placeholder="000" />
                </div>
                <div className="sie-field">
                  <label>
                    ח.פ. / עוסק מורשה
                    {invoice.uniqueId && <span className="sie-auto-badge">AI</span>}
                  </label>
                  <input type="text" value={invoice.uniqueId} onChange={e => updateInvoice('uniqueId', e.target.value)} placeholder="ח.פ. / עוסק מורשה" />
                </div>
                <div className="sie-field sie-field-wide">
                  <label>
                    פרטים
                    {invoice.details && <span className="sie-auto-badge">AI</span>}
                  </label>
                  <input type="text" value={invoice.details} onChange={e => updateInvoice('details', e.target.value)} />
                </div>
              </div>

              {/* Items table */}
              <div className="sie-items-header">
                <h3>שורות חשבונית</h3>
                <button className="sie-add-item" onClick={addItem}>+ שורה</button>
              </div>
              <div className="ariel-card">
                <table className="ariel-table sie-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>מקט</th>
                      <th>תאור</th>
                      <th>חשבון</th>
                      <th>לפני מע״מ</th>
                      <th>כולל מע״מ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="sie-row-num">{idx + 1}</td>
                        <td>
                          <input type="text" value={item.partname} onChange={e => updateItem(idx, 'partname', e.target.value)} placeholder="000" />
                        </td>
                        <td>
                          <input type="text" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                        </td>
                        <td>
                          <input type="text" value={item.account} onChange={e => updateItem(idx, 'account', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" className="sie-num-input" value={item.amountNoVat} onChange={e => updateItem(idx, 'amountNoVat', e.target.value)} />
                        </td>
                        <td>
                          <input type="number" className="sie-num-input" value={item.amountWithVat} onChange={e => updateItem(idx, 'amountWithVat', e.target.value)} />
                        </td>
                        <td>
                          {invoice.items.length > 1 && (
                            <button className="sie-remove-item" onClick={() => removeItem(idx)}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {(totalNoVat > 0 || totalWithVat > 0) && (
                    <tfoot>
                      <tr className="ariel-totals-row">
                        <td colSpan={4} className="ariel-totals-label">סה״כ</td>
                        <td className="ariel-num">{totalNoVat.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                        <td className="ariel-num">{totalWithVat.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
