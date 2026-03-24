import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import * as XLSX from 'xlsx'
import './QrGeneratorPage.css'

const BOT_PHONE_DEFAULT = '972547653274'

export default function QrGeneratorPage() {
  const [botPhone, setBotPhone] = useState(BOT_PHONE_DEFAULT)
  const [rows, setRows] = useState([
    { id: 1, deviceNum: '' },
  ])
  const [generated, setGenerated] = useState([])
  const [pdfLoading, setPdfLoading] = useState(false)
  const [xlsxError, setXlsxError] = useState('')
  const printRef = useRef(null)
  const fileInputRef = useRef(null)

  function addRow() {
    setRows(r => [...r, { id: Date.now(), deviceNum: '' }])
  }

  function removeRow(id) {
    setRows(r => r.filter(row => row.id !== id))
  }

  function handleExcelUpload(e) {
    setXlsxError('')
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
        // Skip header row, map columns: [0]=deviceNum
        const loaded = data
          .slice(1)
          .filter(row => row[0])
          .map((row, i) => ({
            id: Date.now() + i,
            deviceNum: String(row[0] || '').trim(),
          }))
        if (!loaded.length) {
          setXlsxError('לא נמצאו שורות בקובץ')
          return
        }
        setRows(loaded)
        setGenerated([])
      } catch (err) {
        setXlsxError('שגיאה בקריאת הקובץ: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  function updateRow(id, field, value) {
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  function buildWaText(row) {
    return `פתיחת קריאה לאחזקה\nמספר מכשיר: ${row.deviceNum}`
  }

  function buildWaLink(row) {
    return `https://wa.me/${botPhone}?text=${encodeURIComponent(buildWaText(row))}`
  }

  function generate() {
    const valid = rows.filter(r => r.deviceNum.trim())
    if (!valid.length) return
    setGenerated(valid.map(r => ({ ...r, waLink: buildWaLink(r), waText: buildWaText(r) })))
  }

  function downloadQr(id, deviceNum) {
    const canvas = document.getElementById(`qr-canvas-${id}`)
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `QR-${deviceNum || id}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  async function downloadPdf() {
    setPdfLoading(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.create()

      const CARD_W = 260
      const CARD_H = 360
      const PER_ROW = 2
      const MARGIN = 25
      const PAGE_W = 595
      const PAGE_H = 842

      const chunks = []
      for (let i = 0; i < generated.length; i += PER_ROW) {
        chunks.push(generated.slice(i, i + PER_ROW))
      }

      for (const rowItems of chunks) {
        const page = pdfDoc.addPage([PAGE_W, PAGE_H])

        for (let j = 0; j < rowItems.length; j++) {
          const item = rowItems[j]
          const qrCanvas = document.getElementById(`qr-canvas-${item.id}`)
          if (!qrCanvas) continue

          // Draw card on offscreen canvas
          const cardCanvas = document.createElement('canvas')
          cardCanvas.width = CARD_W
          cardCanvas.height = CARD_H
          const ctx = cardCanvas.getContext('2d')

          // Background
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, CARD_W, CARD_H)

          // Border
          ctx.strokeStyle = '#E2E8F0'
          ctx.lineWidth = 1
          ctx.strokeRect(0.5, 0.5, CARD_W - 1, CARD_H - 1)

          // QR image centered
          const qrSize = 220
          const qrX = (CARD_W - qrSize) / 2
          ctx.drawImage(qrCanvas, qrX, 10, qrSize, qrSize)

          // Device number
          ctx.fillStyle = '#1a365d'
          ctx.font = 'bold 18px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(item.deviceNum, CARD_W / 2, 248)

          // Divider
          ctx.strokeStyle = '#E2E8F0'
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(10, 270)
          ctx.lineTo(CARD_W - 10, 270)
          ctx.stroke()

          // WA text
          ctx.fillStyle = '#25D366'
          ctx.font = 'bold 11px Arial'
          ctx.fillText('סרוק לפתיחת WhatsApp', CARD_W / 2, 290)

          ctx.fillStyle = '#718096'
          ctx.font = '10px Arial'
          ctx.fillText(item.waText.replace(/\n/g, '  |  '), CARD_W / 2, 308)

          // Embed in PDF
          const pngData = cardCanvas.toDataURL('image/png')
          const pngBytes = await fetch(pngData).then(r => r.arrayBuffer())
          const pngImage = await pdfDoc.embedPng(pngBytes)

          const x = MARGIN + j * (CARD_W + MARGIN)
          const y = PAGE_H - MARGIN - CARD_H
          page.drawImage(pngImage, { x, y, width: CARD_W, height: CARD_H })
        }
      }

      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `QR-devices-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('PDF error:', e)
      alert('שגיאה ביצירת PDF: ' + e.message)
    }
    setPdfLoading(false)
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['מספר מכשיר'],
      ['203-00000011'],
      ['203-00000012'],
    ])
    ws['!cols'] = [{ wch: 25 }]
    XLSX.utils.book_append_sheet(wb, ws, 'מכשירים')
    XLSX.writeFile(wb, 'template-devices.xlsx')
  }

  function downloadExcelWithQr() {
    if (!generated.length) return
    const wb = XLSX.utils.book_new()
    const data = [
      ['מספר מכשיר', 'קישור QR'],
      ...generated.map(item => [
        item.deviceNum,
        item.waLink,
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 25 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, ws, 'מכשירים')
    XLSX.writeFile(wb, `devices-qr-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="qrg-page">
      <div className="container">
        <Link to="/maintenance" className="qrg-back">&rarr; חזרה לאחזקה</Link>
        <h1 className="qrg-title">יצירת QR למכשירים</h1>
        <p className="qrg-subtitle">צור קוד QR לכל מכשיר — לקוח יסרוק ויפתח שיחת WhatsApp עם הבוט ומספר המכשיר</p>

        {/* Config */}
        <div className="qrg-config">
          <label className="qrg-label">מספר טלפון של הבוט (ללא + ורווחים)</label>
          <input
            className="qrg-input qrg-phone-input"
            value={botPhone}
            onChange={e => setBotPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="972547653274"
            dir="ltr"
          />
        </div>

        {/* Excel upload */}
        <div className="qrg-excel-bar">
          <button className="qrg-excel-btn" onClick={downloadTemplate}>
            📄 שמור קובץ טמפלט
          </button>
          <button className="qrg-excel-btn" onClick={() => fileInputRef.current.click()}>
            📂 העלה קובץ Excel
          </button>
          <span className="qrg-excel-hint">עמודה נדרשת: מספר מכשיר</span>
          {xlsxError && <span className="qrg-excel-error">{xlsxError}</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleExcelUpload}
          />
        </div>

        {/* Table of devices */}
        <div className="qrg-table-wrap">
          <table className="qrg-table">
            <thead>
              <tr>
                <th>#</th>
                <th>מספר מכשיר *</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id}>
                  <td className="qrg-td-num">{i + 1}</td>
                  <td>
                    <input
                      className="qrg-input"
                      value={row.deviceNum}
                      onChange={e => updateRow(row.id, 'deviceNum', e.target.value)}
                      placeholder="203-00000011"
                    />
                  </td>
                  <td>
                    {rows.length > 1 && (
                      <button className="qrg-remove-btn" onClick={() => removeRow(row.id)}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="qrg-add-row-btn" onClick={addRow}>+ הוסף מכשיר</button>
        </div>

        <button className="qrg-generate-btn" onClick={generate}>
          צור QR
        </button>

        {/* Generated QR cards */}
        {generated.length > 0 && (
          <>
            <div className="qrg-results-header">
              <h2 className="qrg-results-title">קודי QR ({generated.length})</h2>
              <div className="qrg-results-actions">
                <button className="qrg-pdf-btn no-print" onClick={downloadPdf} disabled={pdfLoading}>
                  {pdfLoading ? 'יוצר PDF...' : '⬇ הורד PDF'}
                </button>
                <button className="qrg-excel-btn no-print" onClick={downloadExcelWithQr}>📊 הורד Excel</button>
                <button className="qrg-print-btn no-print" onClick={handlePrint}>🖨️ הדפס הכל</button>
              </div>
            </div>
            <div className="qrg-cards" ref={printRef}>
              {generated.map(item => (
                <div key={item.id} className="qrg-card">
                  <QRCodeCanvas
                    id={`qr-canvas-${item.id}`}
                    value={item.waLink}
                    size={240}
                    level="M"
                    includeMargin={true}
                  />
                  <div className="qrg-card-info">
                    <div className="qrg-card-device">{item.deviceNum}</div>
                  </div>
                  <div className="qrg-card-wa-data">
                    <div className="qrg-wa-label">📱 נתונים שיישלחו לבוט:</div>
                    <pre className="qrg-wa-text">{item.waText}</pre>
                  </div>
                  <button
                    className="qrg-download-btn no-print"
                    onClick={() => downloadQr(item.id, item.deviceNum)}
                  >
                    ⬇ PNG
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
