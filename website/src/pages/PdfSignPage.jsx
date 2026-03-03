import { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PdfSignPage.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const DISPLAY_WIDTH = 780

// ── Render a pdfjs page to a data URL ─────────────────────────
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

// ── Render pasted text to a PNG data URL ──────────────────────
function textToDataUrl(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return null

  const fontSize  = 22
  const lineH     = fontSize + 10
  const padding   = 16
  const font      = `${fontSize}px Arial`

  // Measure
  const offscreen = document.createElement('canvas')
  const octx      = offscreen.getContext('2d')
  octx.font = font
  const maxW = Math.max(...lines.map(l => octx.measureText(l).width))

  const canvas  = document.createElement('canvas')
  canvas.width  = Math.ceil(maxW) + padding * 2
  canvas.height = lines.length * lineH + padding * 2

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font      = font
  ctx.fillStyle = '#1a1a1a'
  ctx.textBaseline = 'top'
  // RTL support
  ctx.direction = 'rtl'
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width - padding, padding + i * lineH)
  })

  return canvas.toDataURL('image/png')
}

// ── Apply a data URL as the stamp ─────────────────────────────
function applyStamp(dataUrl, setters) {
  const { setSigDataUrl, setSigNatural } = setters
  const img = new Image()
  img.onload = () => {
    setSigDataUrl(dataUrl)
    setSigNatural({ w: img.naturalWidth, h: img.naturalHeight })
  }
  img.src = dataUrl
}

export default function PdfSignPage() {
  const [pdfBytes, setPdfBytes]           = useState(null)
  const [pdfName, setPdfName]             = useState('')
  const [pages, setPages]                 = useState([])
  const [selectedPage, setSelectedPage]   = useState(0)
  const [sigDataUrl, setSigDataUrl]       = useState(null)
  const [sigNatural, setSigNatural]       = useState(null)
  const [placements, setPlacements]       = useState([])
  const [loading, setLoading]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [status, setStatus]               = useState('')
  const [pasteHint, setPasteHint]         = useState(false)  // flash hint

  const [dragging, setDragging]           = useState(false)
  const [resizing, setResizing]           = useState(false)
  const [dragOffset, setDragOffset]       = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart]     = useState(null)

  const viewerRef   = useRef(null)
  const pdfInputRef = useRef(null)
  const sigInputRef = useRef(null)

  const setters = { setSigDataUrl, setSigNatural }

  const currentPlacement = placements.find(p => p.pageIdx === selectedPage) || null

  // ── Paste event (Ctrl+V) ──────────────────────────────────────
  useEffect(() => {
    const onPaste = (e) => {
      // Don't intercept paste in form fields
      const tag = (document.activeElement?.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const cd = e.clipboardData
      if (!cd) return

      // 1. Image — check items (kind=file), then files fallback
      const items = Array.from(cd.items || [])
      const imgItem = items.find(it => it.kind === 'file' && it.type.startsWith('image/'))
      const blob = imgItem?.getAsFile()
        || Array.from(cd.files || []).find(f => f.type.startsWith('image/'))

      if (blob) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          applyStamp(ev.target.result, setters)
          setPasteHint(true)
          setTimeout(() => setPasteHint(false), 2000)
        }
        reader.readAsDataURL(blob)
        return
      }

      // 2. Plain text → render to canvas (synchronous, more reliable than getAsString)
      const text = cd.getData('text/plain')
      if (text?.trim()) {
        const dataUrl = textToDataUrl(text.trim())
        if (dataUrl) {
          applyStamp(dataUrl, setters)
          setPasteHint(true)
          setTimeout(() => setPasteHint(false), 2000)
        }
      }
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, []) // eslint-disable-line

  // ── Load PDF ──────────────────────────────────────────────────
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
    } catch {
      setStatus('שגיאה בטעינת ה-PDF')
    }
    setLoading(false)
  }, [])

  // ── Load signature from file (fallback) ───────────────────────
  const loadSigFile = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = (e) => applyStamp(e.target.result, setters)
    reader.readAsDataURL(file)
  }, []) // eslint-disable-line

  // ── Place stamp on current page ───────────────────────────────
  const placeSigOnPage = useCallback(() => {
    if (!sigDataUrl || !sigNatural || !pages[selectedPage]) return
    const pg   = pages[selectedPage]
    const sigW = Math.min(220, pg.displayW * 0.28)
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

  useEffect(() => {
    if (sigDataUrl && pages[selectedPage] && !currentPlacement) {
      placeSigOnPage()
    }
  }, [selectedPage]) // eslint-disable-line

  const removePlacement = () =>
    setPlacements(prev => prev.filter(p => p.pageIdx !== selectedPage))

  const updatePlacement = useCallback((updater) => {
    setPlacements(prev => prev.map(p =>
      p.pageIdx === selectedPage ? { ...p, ...updater(p) } : p
    ))
  }, [selectedPage])

  // ── Drag / resize ─────────────────────────────────────────────
  const onSigMouseDown = (e) => {
    if (!currentPlacement || e.target.classList.contains('ps-resize')) return
    e.preventDefault()
    const rect = viewerRef.current.getBoundingClientRect()
    setDragOffset({ x: e.clientX - rect.left - currentPlacement.x, y: e.clientY - rect.top - currentPlacement.y })
    setDragging(true)
  }

  const onResizeMouseDown = (e) => {
    if (!currentPlacement) return
    e.preventDefault()
    e.stopPropagation()
    setResizeStart({ mouseX: e.clientX, mouseY: e.clientY, w: currentPlacement.w, h: currentPlacement.h })
    setResizing(true)
  }

  const onMouseMove = useCallback((e) => {
    if (!viewerRef.current || !currentPlacement) return
    const rect = viewerRef.current.getBoundingClientRect()
    const pg   = pages[selectedPage]
    if (dragging) {
      const newX = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, pg.displayW - currentPlacement.w))
      const newY = Math.max(0, Math.min(e.clientY - rect.top  - dragOffset.y, pg.displayH - currentPlacement.h))
      updatePlacement(() => ({ x: newX, y: newY }))
    }
    if (resizing && resizeStart) {
      const dx   = e.clientX - resizeStart.mouseX
      const aspect = resizeStart.h / resizeStart.w
      const newW = Math.max(40, resizeStart.w + dx)
      updatePlacement(() => ({ w: newW, h: newW * aspect }))
    }
  }, [dragging, resizing, dragOffset, resizeStart, currentPlacement, pages, selectedPage, updatePlacement])

  const onMouseUp = useCallback(() => {
    setDragging(false)
    setResizing(false)
    setResizeStart(null)
  }, [])

  // ── Save PDF ──────────────────────────────────────────────────
  const savePdf = async () => {
    if (!pdfBytes || placements.length === 0) return
    setSaving(true)
    setStatus('מכין את הקובץ...')
    try {
      const pdfDoc  = await PDFDocument.load(pdfBytes)
      const pdfPages = pdfDoc.getPages()

      for (const pl of placements) {
        const pg      = pages[pl.pageIdx]
        const pdfPage = pdfPages[pl.pageIdx]
        const xPdf    = pl.x / pg.scale
        const yPdf    = pg.pdfH - (pl.y / pg.scale) - (pl.h / pg.scale)
        const wPdf    = pl.w / pg.scale
        const hPdf    = pl.h / pg.scale

        const resp     = await fetch(sigDataUrl)
        const imgBytes = await resp.arrayBuffer()
        const embedded = sigDataUrl.startsWith('data:image/png')
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes)

        pdfPage.drawImage(embedded, { x: xPdf, y: yPdf, width: wPdf, height: hPdf })
      }

      const saved = await pdfDoc.save()
      const blob  = new Blob([saved], { type: 'application/pdf' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
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

  const pg = pages[selectedPage]

  return (
    <div className="ps-page" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>

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

      {status && (
        <div className={`ps-status ${status.startsWith('שגיאה') ? 'ps-status-err' : 'ps-status-ok'}`}>
          {status}
        </div>
      )}

      <div className="ps-body">

        {/* ── Left panel ── */}
        <div className="ps-left">

          {/* PDF upload */}
          <div
            className="ps-upload-zone"
            onClick={() => pdfInputRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') loadPdf(f) }}
            onDragOver={e => e.preventDefault()}
          >
            {pdfName
              ? <><span className="ps-upload-icon">📄</span><span className="ps-upload-name">{pdfName}</span></>
              : <><span className="ps-upload-icon">📂</span><span>גרור או לחץ להטענת PDF</span></>
            }
          </div>
          <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && loadPdf(e.target.files[0])} />

          {/* Paste zone */}
          <div className={`ps-paste-zone${pasteHint ? ' ps-paste-active' : ''}`}>
            <span className="ps-paste-icon">📋</span>
            <div className="ps-paste-text">
              <strong>הדבק חתימה — Ctrl+V</strong>
              <span>תמונה, צילום מסך או טקסט מ-Word</span>
            </div>
            {sigDataUrl && (
              <img src={sigDataUrl} alt="חתימה" className="ps-sig-preview" />
            )}
          </div>

          {/* File upload fallback */}
          <div className="ps-file-fallback" onClick={() => sigInputRef.current?.click()}>
            📁 העלה קובץ תמונה
          </div>
          <input ref={sigInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && loadSigFile(e.target.files[0])} />

          {/* Stamp controls */}
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

        {/* ── Right panel: viewer ── */}
        <div className="ps-right">
          {!pages.length && !loading && (
            <div className="ps-empty">
              <span className="ps-empty-icon">📄</span>
              <p>טען קובץ PDF כדי להתחיל</p>
              <p className="ps-empty-hint">לאחר הטעינה — הדבק חתימה עם Ctrl+V</p>
            </div>
          )}

          {pg && (
            <div
              className="ps-viewer"
              ref={viewerRef}
              style={{ width: pg.displayW, height: pg.displayH }}
            >
              <img src={pg.dataUrl} alt={`עמוד ${selectedPage + 1}`} className="ps-page-img" draggable={false} />

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
