import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './ArielPage.css'
import './PdfToolsPage.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp', 'image/tiff', 'image/gif']
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif', '.gif']

function isImageFile(file) {
  if (IMAGE_TYPES.includes(file.type)) return true
  const name = file.name.toLowerCase()
  return IMAGE_EXTS.some(ext => name.endsWith(ext))
}

function isPdfFile(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

// Load image as HTMLImageElement
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('שגיאה בטעינת תמונה')) }
    img.src = url
  })
}

// Convert image to a single-page PDF (returns Uint8Array)
async function imageToPdf(file) {
  const img = await loadImage(file)
  const pdfDoc = await PDFDocument.create()

  const arrayBuf = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuf)
  const mime = file.type.toLowerCase()

  let embedded
  if (mime === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    embedded = await pdfDoc.embedPng(bytes)
  } else {
    // Convert other formats (bmp, webp, gif, tiff) to PNG via canvas, or embed jpg directly
    if (mime === 'image/jpeg' || file.name.toLowerCase().match(/\.jpe?g$/)) {
      embedded = await pdfDoc.embedJpg(bytes)
    } else {
      // Convert to PNG via canvas for formats pdf-lib doesn't support natively
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'))
      const pngBuf = await pngBlob.arrayBuffer()
      embedded = await pdfDoc.embedPng(new Uint8Array(pngBuf))
    }
  }

  const page = pdfDoc.addPage([embedded.width, embedded.height])
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })

  return new Uint8Array(await pdfDoc.save())
}

// Create thumbnail from image file
function imageThumb(file, maxH = 200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxH / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL())
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('thumbnail failed')) }
    img.src = url
  })
}

// Render a single PDF page to a canvas data URL using pdfjs
async function renderPageThumb(pdfDoc, pageIndex, scale = 0.4) {
  const page = await pdfDoc.getPage(pageIndex + 1) // 1-indexed
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL()
}

let nextPageId = 1

export default function PdfToolsPage() {
  const [pages, setPages] = useState([])      // { id, thumbUrl, srcIndex, srcFile, pdfBytes }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [merging, setMerging] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const inputRef = useRef()

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return
    setError(null)
    setLoading(true)

    const newPages = []
    const errors = []
    for (const file of fileList) {
      try {
        if (isPdfFile(file)) {
          // Handle PDF files
          const arrayBuf = await file.arrayBuffer()
          const pdfBytes = new Uint8Array(arrayBuf)

          // Verify file actually starts with %PDF header
          const header = String.fromCharCode(...pdfBytes.slice(0, 5))
          if (!header.startsWith('%PDF')) {
            const textHeader = new TextDecoder().decode(pdfBytes.slice(0, 50))
            if (textHeader.includes('<!DOCTYPE') || textHeader.includes('<html')) {
              throw new Error('הקובץ הוא דף HTML ולא PDF - כנראה ההורדה נכשלה')
            }
            throw new Error('הקובץ אינו PDF תקין (חסר header)')
          }

          const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() })
          const pdfDoc = await loadingTask.promise
          const count = pdfDoc.numPages

          for (let i = 0; i < count; i++) {
            try {
              const thumbUrl = await renderPageThumb(pdfDoc, i)
              newPages.push({
                id: nextPageId++,
                thumbUrl,
                srcFile: file.name,
                srcIndex: i,
                pdfBytes,
              })
            } catch {
              // Skip individual pages that fail to render
            }
          }
          pdfDoc.destroy()
        } else if (isImageFile(file)) {
          // Convert image to single-page PDF
          const pdfBytes = await imageToPdf(file)
          const thumbUrl = await imageThumb(file)
          newPages.push({
            id: nextPageId++,
            thumbUrl,
            srcFile: file.name,
            srcIndex: 0,
            pdfBytes,
          })
        }
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`)
      }
    }

    if (newPages.length > 0) {
      setPages(prev => [...prev, ...newPages])
    }
    if (errors.length > 0) {
      setError(errors.length === fileList.length
        ? 'שגיאה בקריאת קבצים: ' + errors.join(', ')
        : `חלק מהקבצים לא נטענו: ${errors.join(', ')}`)
    } else if (newPages.length === 0) {
      setError('לא נמצאו קבצים תקינים (PDF או תמונות)')
    }
    setLoading(false)
  }

  function onDrop(e) {
    e.preventDefault()
    handleFiles(Array.from(e.dataTransfer.files))
  }

  function onDragOver(e) {
    e.preventDefault()
  }

  function removePage(id) {
    setPages(prev => prev.filter(p => p.id !== id))
  }

  function removeAll() {
    setPages([])
    setError(null)
  }

  // Drag-and-drop reorder
  function onPageDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '')
  }

  function onPageDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }

  function onPageDragEnd() {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setPages(prev => {
        const next = [...prev]
        const [moved] = next.splice(dragIdx, 1)
        next.splice(dragOverIdx, 0, moved)
        return next
      })
    }
    setDragIdx(null)
    setDragOverIdx(null)
  }

  // Move page up/down
  function movePage(idx, direction) {
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= pages.length) return
    setPages(prev => {
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }

  async function mergePdf() {
    if (pages.length === 0) return
    setMerging(true)
    setError(null)

    try {
      const merged = await PDFDocument.create()

      // Cache loaded source docs to avoid re-loading the same file
      const srcCache = new Map()
      for (const page of pages) {
        let srcDoc = srcCache.get(page.pdfBytes)
        if (!srcDoc) {
          srcDoc = await PDFDocument.load(page.pdfBytes, {
            ignoreEncryption: true,
            updateMetadata: false,
          })
          srcCache.set(page.pdfBytes, srcDoc)
        }
        const [copiedPage] = await merged.copyPages(srcDoc, [page.srcIndex])
        merged.addPage(copiedPage)
      }

      const mergedBytes = await merged.save()
      const blob = new Blob([mergedBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'merged.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('שגיאה ביצירת הקובץ: ' + e.message)
    } finally {
      setMerging(false)
    }
  }

  const hasPages = pages.length > 0

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/apps" className="ariel-back">&rarr; חזרה לאפליקציות</Link>

        <h1 className="ariel-title">כלי PDF - איחוד, המרה וסידור דפים</h1>

        {/* Upload area */}
        <div
          className="sup-dropzone"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.bmp,.webp,.tiff,.tif,.gif"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(Array.from(e.target.files))}
          />
          <span className="sup-dropzone-icon">📄</span>
          <span className="sup-dropzone-text">
            {hasPages ? 'הוסף עוד קבצים' : 'גרור קבצי PDF או תמונות, או לחץ לבחירה'}
          </span>
          <span className="sup-dropzone-hint">PDF, JPG, PNG, BMP, WEBP, TIFF, GIF</span>
        </div>

        {loading && (
          <div className="ariel-loading">
            <div className="ariel-spinner" />
            <span>טוען קבצים...</span>
          </div>
        )}

        {error && <div className="ariel-error">{error}</div>}

        {hasPages && (
          <>
            <div className="pdf-toolbar">
              <span className="pdf-page-count">{pages.length} דפים</span>
              <button className="ariel-print-btn" onClick={mergePdf} disabled={merging}>
                {merging ? 'יוצר PDF...' : 'הורד PDF מאוחד'}
              </button>
              <button className="pdf-clear-btn" onClick={removeAll}>נקה הכל</button>
            </div>

            <div className="pdf-pages-grid">
              {pages.map((page, idx) => (
                <div
                  key={page.id}
                  className={`pdf-page-card${dragIdx === idx ? ' pdf-page-dragging' : ''}${dragOverIdx === idx ? ' pdf-page-dragover' : ''}`}
                  draggable
                  onDragStart={(e) => onPageDragStart(e, idx)}
                  onDragOver={(e) => onPageDragOver(e, idx)}
                  onDragEnd={onPageDragEnd}
                >
                  <div className="pdf-page-num">{idx + 1}</div>
                  <img src={page.thumbUrl} alt={`עמוד ${idx + 1}`} className="pdf-page-thumb" />
                  <div className="pdf-page-info">
                    <span className="pdf-page-src" title={page.srcFile}>
                      {page.srcFile} (עמ׳ {page.srcIndex + 1})
                    </span>
                  </div>
                  <div className="pdf-page-actions">
                    <button
                      className="pdf-move-btn"
                      onClick={() => movePage(idx, -1)}
                      disabled={idx === 0}
                      title="הזז למעלה"
                    >&#8593;</button>
                    <button
                      className="pdf-move-btn"
                      onClick={() => movePage(idx, 1)}
                      disabled={idx === pages.length - 1}
                      title="הזז למטה"
                    >&#8595;</button>
                    <button
                      className="pdf-delete-btn"
                      onClick={() => removePage(page.id)}
                      title="מחק עמוד"
                    >&times;</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
