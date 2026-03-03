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

// ── Rotate a data URL N degrees CW, returns Promise<dataUrl> ──
function rotateDataUrl(dataUrl, degrees) {
  if (!degrees || degrees % 360 === 0) return Promise.resolve(dataUrl)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const rad  = (degrees * Math.PI) / 180
      const sin  = Math.abs(Math.sin(rad))
      const cos  = Math.abs(Math.cos(rad))
      const newW = Math.round(img.width * cos + img.height * sin)
      const newH = Math.round(img.width * sin + img.height * cos)
      const canvas = document.createElement('canvas')
      canvas.width  = newW
      canvas.height = newH
      const ctx = canvas.getContext('2d')
      ctx.translate(newW / 2, newH / 2)
      ctx.rotate(rad)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = dataUrl
  })
}

// ── Apply a data URL as the stamp ─────────────────────────────
function applyStamp(dataUrl, setters) {
  const { setSigDataUrl, setSigNatural, setSigHistory } = setters
  const img = new Image()
  img.onload = () => {
    const entry = { dataUrl, w: img.naturalWidth, h: img.naturalHeight }
    setSigDataUrl(dataUrl)
    setSigNatural({ w: img.naturalWidth, h: img.naturalHeight })
    setSigHistory(prev => {
      const filtered = prev.filter(e => e.dataUrl !== dataUrl)
      return [entry, ...filtered].slice(0, 3)
    })
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
  const [sigHistory, setSigHistory]       = useState([])   // [{dataUrl, w, h}] max 3
  const [placements, setPlacements]       = useState([])
  const [loading, setLoading]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [status, setStatus]               = useState('')
  const [pasteHint, setPasteHint]         = useState(false)  // flash hint

  const [dragging, setDragging]           = useState(false)
  const [resizing, setResizing]           = useState(false)
  const [dragOffset, setDragOffset]       = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart]     = useState(null)
  const [selectedPlacementId, setSelectedPlacementId] = useState(null)

  const viewerRef   = useRef(null)
  const pdfInputRef = useRef(null)
  const sigInputRef = useRef(null)

  const setters = { setSigDataUrl, setSigNatural, setSigHistory }

  // Selected placement (for drag / resize / controls)
  const currentPlacement = placements.find(p => p.id === selectedPlacementId) || null

  // Clear selection when switching pages
  useEffect(() => { setSelectedPlacementId(null) }, [selectedPage])

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

  // ── Place stamp on current page (always adds new) ─────────────
  const placeSigOnPage = useCallback(() => {
    if (!sigDataUrl || !sigNatural || !pages[selectedPage]) return
    const pg   = pages[selectedPage]
    const sigW = Math.min(220, pg.displayW * 0.28)
    const sigH = sigW * (sigNatural.h / sigNatural.w)
    const id   = Date.now()
    const placement = {
      id,
      pageIdx: selectedPage,
      x: (pg.displayW - sigW) / 2,
      y: (pg.displayH - sigH) / 2,
      w: sigW,
      h: sigH,
      rotation: 0,
      imgUrl: sigDataUrl,   // each placement owns its image
    }
    setPlacements(prev => [...prev, placement])
    setSelectedPlacementId(id)
  }, [sigDataUrl, sigNatural, pages, selectedPage])

  const removePlacement = () => {
    setPlacements(prev => prev.filter(p => p.id !== selectedPlacementId))
    setSelectedPlacementId(null)
  }

  const updatePlacement = useCallback((updater) => {
    setPlacements(prev => prev.map(p =>
      p.id === selectedPlacementId ? { ...p, ...updater(p) } : p
    ))
  }, [selectedPlacementId])

  const rotateSig = (delta) =>
    updatePlacement(p => ({ rotation: ((p.rotation || 0) + delta + 360) % 360 }))

  const scaleSig = (factor) =>
    updatePlacement(p => {
      const newW = Math.max(40, Math.min(p.w * factor, pages[selectedPage].displayW * 0.9))
      return { w: newW, h: newW * (p.h / p.w) }
    })

  // ── Drag / resize ─────────────────────────────────────────────
  const onSigMouseDown = (e, id) => {
    if (e.target.classList.contains('ps-resize')) return
    e.preventDefault()
    const pl = placements.find(p => p.id === id)
    if (!pl) return
    setSelectedPlacementId(id)
    const rect = viewerRef.current.getBoundingClientRect()
    setDragOffset({ x: e.clientX - rect.left - pl.x, y: e.clientY - rect.top - pl.y })
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
        const rot     = pl.rotation || 0

        // Pre-rotate the image on a canvas (handles CW rotation correctly)
        const rotatedUrl = await rotateDataUrl(pl.imgUrl, rot)

        // For 90 / 270, visual w and h swap
        const is90 = rot === 90 || rot === 270
        const wPdf = (is90 ? pl.h : pl.w) / pg.scale
        const hPdf = (is90 ? pl.w : pl.h) / pg.scale

        // Draw centered on the same spot as the overlay (PDF origin is bottom-left)
        const centerXPdf = (pl.x + pl.w / 2) / pg.scale
        const centerYPdf = pg.pdfH - (pl.y + pl.h / 2) / pg.scale
        const xPdf = centerXPdf - wPdf / 2
        const yPdf = centerYPdf - hPdf / 2

        const resp     = await fetch(rotatedUrl)
        const imgBytes = await resp.arrayBuffer()
        const embedded = rotatedUrl.startsWith('data:image/png')
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
          </div>

          {/* File upload fallback */}
          <div className="ps-file-fallback" onClick={() => sigInputRef.current?.click()}>
            📁 העלה קובץ תמונה
          </div>
          <input ref={sigInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && loadSigFile(e.target.files[0])} />

          {/* Signature history gallery */}
          {sigHistory.length > 0 && (
            <div className="ps-sig-history">
              <div className="ps-sig-history-label">חתימות אחרונות</div>
              <div className="ps-sig-history-row">
                {sigHistory.map((s, i) => (
                  <div
                    key={i}
                    className={`ps-sig-hist-item${s.dataUrl === sigDataUrl ? ' ps-sig-hist-active' : ''}`}
                    onClick={() => { setSigDataUrl(s.dataUrl); setSigNatural({ w: s.w, h: s.h }) }}
                    title={i === 0 ? 'הכי אחרונה' : `${i + 1} אחורה`}
                  >
                    <img src={s.dataUrl} alt={`חתימה ${i + 1}`} />
                    {s.dataUrl === sigDataUrl && <span className="ps-sig-hist-check">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stamp controls */}
          {sigDataUrl && pages.length > 0 && (
            <div className="ps-sig-controls">
              <button className="ps-btn-place" onClick={placeSigOnPage}>
                + הוסף לדף
              </button>
              {currentPlacement && (
                <>
                  <div className="ps-transform-row">
                    <button className="ps-btn-transform" onClick={() => scaleSig(0.85)} title="הקטן">−</button>
                    <button className="ps-btn-transform" onClick={() => scaleSig(1.18)} title="הגדל">+</button>
                    <button className="ps-btn-transform" onClick={() => rotateSig(-90)} title="סובב שמאל 90°">↺</button>
                    <button className="ps-btn-transform" onClick={() => rotateSig(90)}  title="סובב ימין 90°">↻</button>
                  </div>
                  <div className="ps-rotation-row">
                    <input
                      type="range"
                      className="ps-rotation-slider"
                      min="0" max="359" step="1"
                      value={currentPlacement.rotation || 0}
                      onChange={e => updatePlacement(() => ({ rotation: Number(e.target.value) }))}
                    />
                    <span className="ps-rotation-val">{currentPlacement.rotation || 0}°</span>
                  </div>
                  <button className="ps-btn-remove" onClick={removePlacement}>✕ הסר חתימה</button>
                </>
              )}
              <div className="ps-placement-count">
                {placements.filter(p => p.pageIdx === selectedPage).length} בדף · {placements.length} סה"כ
              </div>
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

              {placements
                .filter(p => p.pageIdx === selectedPage)
                .map(p => (
                  <div
                    key={p.id}
                    className={`ps-sig-overlay${
                      p.id === selectedPlacementId
                        ? (dragging ? ' ps-sig-dragging' : ' ps-sig-selected')
                        : ''
                    }`}
                    style={{
                      left: p.x,
                      top:  p.y,
                      width: p.w,
                      height: p.h,
                      transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                    }}
                    onMouseDown={e => onSigMouseDown(e, p.id)}
                  >
                    <img src={p.imgUrl} alt="חתימה" draggable={false} />
                    {p.id === selectedPlacementId && (
                      <div className="ps-resize" onMouseDown={onResizeMouseDown} />
                    )}
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* ── Thumbnails panel: left side (RTL = leftmost visually) ── */}
        {(pages.length > 0 || loading) && (
          <div className="ps-thumbs-panel">
            {loading && <div className="ps-loading">טוען...</div>}
            <div className="ps-thumbs">
              {pages.map((p, i) => (
                <div
                  key={i}
                  className={`ps-thumb ${i === selectedPage ? 'ps-thumb-selected' : ''}`}
                  onClick={() => setSelectedPage(i)}
                >
                  <img src={p.dataUrl} alt={`עמוד ${i + 1}`} />
                  <span className="ps-thumb-num">{i + 1}</span>
                  {(() => {
                    const n = placements.filter(pl => pl.pageIdx === i).length
                    return n > 0 ? <span className="ps-thumb-badge">{n > 1 ? n : '✍️'}</span> : null
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
