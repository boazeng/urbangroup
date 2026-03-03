import { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PdfSignPage.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const DISPLAY_WIDTH = 780  // max render width for the large page view

// ── Render a pdfjs page to a canvas and return data ───────────
async function renderPage(pdfPage) {
  const viewport = pdfPage.getViewport({ scale: 1 })
  const scale = DISPLAY_WIDTH / viewport.width
  const scaled = pdfPage.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(scaled.width)
  canvas.height = Math.round(scaled.height)
  await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    displayW: canvas.width,
    displayH: canvas.height,
    scale,
    pdfW: viewport.width,
    pdfH: viewport.height,
  }
}

export default function PdfSignPage() {
  const [pdfBytes, setPdfBytes]       = useState(null)   // ArrayBuffer
  const [pdfName, setPdfName]         = useState('')
  const [pages, setPages]             = useState([])      // [{dataUrl, displayW, displayH, scale, pdfW, pdfH}]
  const [selectedPage, setSelectedPage] = useState(0)
  const [sigDataUrl, setSigDataUrl]   = useState(null)    // uploaded signature data URL
  const [sigNatural, setSigNatural]   = useState(null)    // {w, h} natural size
  const [placements, setPlacements]   = useState([])      // [{pageIdx, x, y, w, h}] display px
  const [loading, setLoading]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [status, setStatus]           = useState('')

  // Drag state
  const [dragging, setDragging]       = useState(false)
  const [resizing, setResizing]       = useState(false)
  const [dragOffset, setDragOffset]   = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState(null)  // {mouseX, mouseY, w, h}

  const viewerRef   = useRef(null)
  const pdfInputRef = useRef(null)
  const sigInputRef = useRef(null)

  // Current page's placement (if any)
  const currentPlacement = placements.find(p => p.pageIdx === selectedPage) || null

  // ── Load PDF ─────────────────────────────────────────────────
  const loadPdf = useCallback(async (file) => {
    setLoading(true)
    setStatus('')
    setPlacements([])
    setSigDataUrl(null)
    setSigNatural(null)
    try {
      const bytes = await file.arrayBuffer()
      setPdfBytes(bytes)
      setPdfName(file.name)
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise
      const rendered = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        rendered.push(await renderPage(page))
      }
      setPages(rendered)
      setSelectedPage(0)
    } catch (e) {
      setStatus('שגיאה בטעינת ה-PDF')
    }
    setLoading(false)
  }, [])

  // ── Load signature image ──────────────────────────────────────
  const loadSig = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        setSigDataUrl(e.target.result)
        setSigNatural({ w: img.naturalWidth, h: img.naturalHeight })
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }, [])

  // ── Place signature on current page (or reset position) ──────
  const placeSigOnPage = useCallback(() => {
    if (!sigDataUrl || !pages[selectedPage]) return
    const pg = pages[selectedPage]
    const sigW = Math.min(200, pg.displayW * 0.25)
    const sigH = sigW * (sigNatural.h / sigNatural.w)
    const placement = {
      pageIdx: selectedPage,
      x: (pg.displayW - sigW) / 2,
      y: (pg.displayH - sigH) / 2,
      w: sigW,
      h: sigH,
    }
    setPlacements(prev => [...prev.filter(p => p.pageIdx !== selectedPage), placement])
  }, [sigDataUrl, sigNatural, pages, selectedPage])

  // Auto-place when switching to a page that has no placement yet
  useEffect(() => {
    if (sigDataUrl && pages[selectedPage] && !currentPlacement) {
      placeSigOnPage()
    }
  }, [selectedPage]) // eslint-disable-line

  // ── Remove placement from current page ───────────────────────
  const removePlacement = () => {
    setPlacements(prev => prev.filter(p => p.pageIdx !== selectedPage))
  }

  // ── Update current placement ─────────────────────────────────
  const updatePlacement = useCallback((updater) => {
    setPlacements(prev => prev.map(p =>
      p.pageIdx === selectedPage ? { ...p, ...updater(p) } : p
    ))
  }, [selectedPage])

  // ── Drag handlers ────────────────────────────────────────────
  const onSigMouseDown = (e) => {
    if (!currentPlacement || e.target.classList.contains('ps-resize')) return
    e.preventDefault()
    const rect = viewerRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left - currentPlacement.x,
      y: e.clientY - rect.top  - currentPlacement.y,
    })
    setDragging(true)
  }

  const onResizeMouseDown = (e) => {
    if (!currentPlacement) return
    e.preventDefault()
    e.stopPropagation()
    setResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      w: currentPlacement.w,
      h: currentPlacement.h,
    })
    setResizing(true)
  }

  const onMouseMove = useCallback((e) => {
    if (!viewerRef.current || !currentPlacement) return
    const rect = viewerRef.current.getBoundingClientRect()
    const pg = pages[selectedPage]

    if (dragging) {
      const newX = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, pg.displayW - currentPlacement.w))
      const newY = Math.max(0, Math.min(e.clientY - rect.top  - dragOffset.y, pg.displayH - currentPlacement.h))
      updatePlacement(() => ({ x: newX, y: newY }))
    }

    if (resizing && resizeStart) {
      const dx = e.clientX - resizeStart.mouseX
      const aspect = resizeStart.h / resizeStart.w
      const newW = Math.max(40, resizeStart.w + dx)
      const newH = newW * aspect
      updatePlacement(() => ({ w: newW, h: newH }))
    }
  }, [dragging, resizing, dragOffset, resizeStart, currentPlacement, pages, selectedPage, updatePlacement])

  const onMouseUp = useCallback(() => {
    setDragging(false)
    setResizing(false)
    setResizeStart(null)
  }, [])

  // ── Save PDF ─────────────────────────────────────────────────
  const savePdf = async () => {
    if (!pdfBytes || placements.length === 0) return
    setSaving(true)
    setStatus('מכין את הקובץ...')
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes)
      const pdfPages = pdfDoc.getPages()

      for (const pl of placements) {
        const pg = pages[pl.pageIdx]
        const pdfPage = pdfPages[pl.pageIdx]

        // Convert display coords (top-left origin) → PDF coords (bottom-left origin)
        const xPdf = pl.x / pg.scale
        const yPdf = pg.pdfH - (pl.y / pg.scale) - (pl.h / pg.scale)
        const wPdf = pl.w / pg.scale
        const hPdf = pl.h / pg.scale

        // Fetch image bytes from dataUrl
        const resp = await fetch(sigDataUrl)
        const imgBytes = await resp.arrayBuffer()

        let embedded
        if (sigDataUrl.startsWith('data:image/png')) {
          embedded = await pdfDoc.embedPng(imgBytes)
        } else {
          embedded = await pdfDoc.embedJpg(imgBytes)
        }

        pdfPage.drawImage(embedded, { x: xPdf, y: yPdf, width: wPdf, height: hPdf })
      }

      const saved = await pdfDoc.save()
      const blob = new Blob([saved], { type: 'application/pdf' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = pdfName.replace(/\.pdf$/i, '') + '-חתום.pdf'
      a.click()
      URL.revokeObjectURL(url)
      setStatus('✓ הקובץ נשמר בהצלחה')
    } catch (e) {
      setStatus('שגיאה בשמירת הקובץ: ' + e.message)
    }
    setSaving(false)
  }

  // ── Drop handlers ─────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (file.type === 'application/pdf') loadPdf(file)
  }

  const pg = pages[selectedPage]

  return (
    <div
      className="ps-page"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Top bar */}
      <div className="ps-topbar">
        <Link to="/apps" className="ps-back">&rarr; חזרה לאפליקציות</Link>
        <h1 className="ps-title">חתימה על PDF</h1>
        <div className="ps-topbar-actions">
          {pdfBytes && placements.length > 0 && (
            <button className="ps-save-btn" onClick={savePdf} disabled={saving}>
              {saving ? 'שומר...' : '💾 שמור PDF'}
            </button>
          )}
        </div>
      </div>

      {status && <div className={`ps-status ${status.startsWith('שגיאה') ? 'ps-status-err' : 'ps-status-ok'}`}>{status}</div>}

      {/* Main body */}
      <div className="ps-body">

        {/* Left panel */}
        <div className="ps-left">

          {/* PDF upload */}
          <div
            className="ps-upload-zone"
            onClick={() => pdfInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
          >
            {pdfName
              ? <><span className="ps-upload-icon">📄</span><span className="ps-upload-name">{pdfName}</span></>
              : <><span className="ps-upload-icon">📂</span><span>גרור או לחץ להטענת PDF</span></>
            }
          </div>
          <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && loadPdf(e.target.files[0])} />

          {/* Signature upload */}
          <div className="ps-sig-zone" onClick={() => sigInputRef.current?.click()}>
            {sigDataUrl
              ? <img src={sigDataUrl} alt="חתימה" className="ps-sig-preview" />
              : <><span className="ps-upload-icon">✍️</span><span>העלה תמונת חתימה</span></>
            }
          </div>
          <input ref={sigInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={e => e.target.files[0] && loadSig(e.target.files[0])} />

          {/* Signature controls */}
          {sigDataUrl && pages.length > 0 && (
            <div className="ps-sig-controls">
              <button className="ps-btn-place" onClick={placeSigOnPage}>
                {currentPlacement ? '↺ אפס מיקום' : '+ הוסף לדף'}
              </button>
              {currentPlacement && (
                <button className="ps-btn-remove" onClick={removePlacement}>✕ הסר מדף</button>
              )}
              <div className="ps-placement-count">
                {placements.length} דף{placements.length !== 1 ? 'ים' : ''} עם חתימה
              </div>
            </div>
          )}

          {/* Thumbnails */}
          {loading && <div className="ps-loading">טוען...</div>}
          {pages.length > 0 && (
            <div className="ps-thumbs">
              {pages.map((p, i) => (
                <div
                  key={i}
                  className={`ps-thumb ${i === selectedPage ? 'ps-thumb-selected' : ''}`}
                  onClick={() => setSelectedPage(i)}
                >
                  <img src={p.dataUrl} alt={`עמוד ${i + 1}`} />
                  <span className="ps-thumb-num">{i + 1}</span>
                  {placements.some(pl => pl.pageIdx === i) && (
                    <span className="ps-thumb-badge">✍️</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel — large page viewer */}
        <div className="ps-right">
          {!pages.length && !loading && (
            <div className="ps-empty">
              <span className="ps-empty-icon">📄</span>
              <p>טען קובץ PDF כדי להתחיל</p>
            </div>
          )}

          {pg && (
            <div
              className="ps-viewer"
              ref={viewerRef}
              style={{ width: pg.displayW, height: pg.displayH }}
            >
              {/* Page image */}
              <img src={pg.dataUrl} alt={`עמוד ${selectedPage + 1}`} className="ps-page-img" draggable={false} />

              {/* Signature overlay */}
              {currentPlacement && (
                <div
                  className={`ps-sig-overlay${dragging ? ' ps-sig-dragging' : ''}`}
                  style={{
                    left: currentPlacement.x,
                    top:  currentPlacement.y,
                    width: currentPlacement.w,
                    height: currentPlacement.h,
                  }}
                  onMouseDown={onSigMouseDown}
                >
                  <img src={sigDataUrl} alt="חתימה" draggable={false} />
                  {/* Resize handle */}
                  <div className="ps-resize" onMouseDown={onResizeMouseDown} />
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
