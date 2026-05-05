import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import './ArielPage.css'

// Load image element from file
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')) }
    img.src = url
  })
}

async function imageToPdf(file) {
  const img = await loadImage(file)
  const pdfDoc = await PDFDocument.create()
  const arrayBuf = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuf)
  const mime = file.type.toLowerCase()

  let embedded
  if (mime === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    embedded = await pdfDoc.embedPng(bytes)
  } else if (mime === 'image/jpeg' || file.name.toLowerCase().match(/\.jpe?g$/)) {
    embedded = await pdfDoc.embedJpg(bytes)
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    const pngBuf = await pngBlob.arrayBuffer()
    embedded = await pdfDoc.embedPng(new Uint8Array(pngBuf))
  }

  const page = pdfDoc.addPage([embedded.width, embedded.height])
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
  return new Uint8Array(await pdfDoc.save())
}

function downloadBlob(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function nameToPdf(name) {
  return name.replace(/\.[^.]+$/, '') + '.pdf'
}

export default function PdfConvertPage() {
  const [files, setFiles] = useState([])  // [{file, status, error}]
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const isPdf = (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  const isImage = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i.test(f.name)

  const onSelect = (e) => {
    const newFiles = Array.from(e.target.files || []).map(file => ({ file, status: 'ready', error: '' }))
    setFiles(prev => [...prev, ...newFiles])
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const convertAll = async () => {
    setBusy(true)
    const updated = [...files]
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i]
      if (item.status === 'done') continue
      try {
        updated[i] = { ...item, status: 'working', error: '' }
        setFiles([...updated])
        const f = item.file
        let bytes
        if (isPdf(f)) {
          // Already PDF - just keep bytes
          const buf = await f.arrayBuffer()
          bytes = new Uint8Array(buf)
        } else if (isImage(f)) {
          bytes = await imageToPdf(f)
        } else {
          throw new Error('סוג קובץ לא נתמך (תמיכה ב-PDF ותמונות בלבד)')
        }
        downloadBlob(bytes, nameToPdf(f.name))
        updated[i] = { ...item, status: 'done', error: '' }
        setFiles([...updated])
      } catch (e) {
        updated[i] = { ...item, status: 'error', error: e.message }
        setFiles([...updated])
      }
    }
    setBusy(false)
  }

  const clearAll = () => setFiles([])

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/apps" className="ariel-back">&rarr; חזרה לאפליקציות</Link>
        <h1 className="ariel-title">המרה לקובץ PDF</h1>
        <p style={{ color: '#6b7280', marginBottom: '20px' }}>טען קבצים והמערכת תמיר אותם ל-PDF (תומך בתמונות ו-PDF)</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: busy ? 'wait' : 'pointer' }}
          >
            📂 בחר קבצים
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tif,.tiff,image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={onSelect}
          />
          {files.length > 0 && (
            <>
              <button
                onClick={convertAll}
                disabled={busy}
                style={{ padding: '10px 24px', background: busy ? '#999' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: busy ? 'wait' : 'pointer' }}
              >
                {busy ? 'ממיר...' : '⬇ המר והורד הכל'}
              </button>
              <button
                onClick={clearAll}
                disabled={busy}
                style={{ padding: '10px 16px', background: '#eee', color: '#333', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: busy ? 'wait' : 'pointer' }}
              >
                נקה
              </button>
            </>
          )}
        </div>

        {files.length === 0 && (
          <div style={{ color: '#888', fontSize: '14px', padding: '40px', textAlign: 'center', border: '2px dashed #ccc', borderRadius: '8px' }}>
            לחץ "בחר קבצים" כדי להתחיל
          </div>
        )}

        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {files.map((item, i) => {
              const f = item.file
              const sizeKB = (f.size / 1024).toFixed(0)
              const statusColor = item.status === 'done' ? '#16a34a' : item.status === 'error' ? '#dc2626' : item.status === 'working' ? '#d97706' : '#555'
              const statusText = item.status === 'done' ? '✓ הומר והורד' : item.status === 'error' ? `✗ ${item.error}` : item.status === 'working' ? '⏳ ממיר...' : 'ממתין'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>{isPdf(f) ? '📄' : isImage(f) ? '🖼️' : '📁'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{sizeKB} KB · {f.type || 'unknown'}</div>
                  </div>
                  <span style={{ fontSize: '12px', color: statusColor, minWidth: '120px' }}>{statusText}</span>
                  {!busy && item.status !== 'done' && (
                    <button
                      onClick={() => removeFile(i)}
                      style={{ padding: '2px 8px', background: '#fee', color: '#c00', border: '1px solid #fcc', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                    >
                      הסר
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {files.some(f => f.status === 'done') && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 16px', borderRadius: '6px', fontSize: '13px' }}>
            ✓ הקבצים הומרו ונשמרו בתיקיית ההורדות שלך
          </div>
        )}
      </div>
    </div>
  )
}
