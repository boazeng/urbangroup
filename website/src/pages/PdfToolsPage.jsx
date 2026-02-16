import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './ArielPage.css'
import './PdfToolsPage.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

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
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        continue
      }
      try {
        const arrayBuf = await file.arrayBuffer()
        const pdfBytes = new Uint8Array(arrayBuf)

        // Use pdfjs-dist for loading (much more lenient than pdf-lib)
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
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`)
      }
    }

    if (newPages.length > 0) {
      setPages(prev => [...prev, ...newPages])
    }
    if (errors.length > 0) {
      setError(errors.length === fileList.length
        ? 'שגיאה בקריאת קבצי PDF: ' + errors.join(', ')
        : `חלק מהקבצים לא נטענו: ${errors.join(', ')}`)
    } else if (newPages.length === 0) {
      setError('לא נמצאו קבצי PDF תקינים')
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

        <h1 className="ariel-title">כלי PDF - איחוד וסידור דפים</h1>

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
            accept=".pdf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(Array.from(e.target.files))}
          />
          <span className="sup-dropzone-icon">📄</span>
          <span className="sup-dropzone-text">
            {hasPages ? 'הוסף עוד קבצי PDF' : 'גרור קבצי PDF או לחץ לבחירה'}
          </span>
        </div>

        {loading && (
          <div className="ariel-loading">
            <div className="ariel-spinner" />
            <span>טוען דפים...</span>
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
