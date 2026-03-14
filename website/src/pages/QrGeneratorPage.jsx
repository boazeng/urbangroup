import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import './QrGeneratorPage.css'

const BOT_PHONE_DEFAULT = '15551790484'

export default function QrGeneratorPage() {
  const [botPhone, setBotPhone] = useState(BOT_PHONE_DEFAULT)
  const [rows, setRows] = useState([
    { id: 1, deviceNum: '', location: '', description: '' },
  ])
  const [generated, setGenerated] = useState([])
  const printRef = useRef(null)

  function addRow() {
    setRows(r => [...r, { id: Date.now(), deviceNum: '', location: '', description: '' }])
  }

  function removeRow(id) {
    setRows(r => r.filter(row => row.id !== id))
  }

  function updateRow(id, field, value) {
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  function buildWaLink(row) {
    const parts = []
    if (row.deviceNum) parts.push(`מספר מכשיר: ${row.deviceNum}`)
    if (row.location) parts.push(`מיקום: ${row.location}`)
    const text = parts.join('\n')
    return `https://wa.me/${botPhone}?text=${encodeURIComponent(text)}`
  }

  function generate() {
    const valid = rows.filter(r => r.deviceNum.trim())
    if (!valid.length) return
    setGenerated(valid.map(r => ({ ...r, waLink: buildWaLink(r) })))
  }

  function downloadQr(id, deviceNum) {
    const canvas = document.getElementById(`qr-canvas-${id}`)
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `QR-${deviceNum || id}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
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
            placeholder="15551790484"
            dir="ltr"
          />
        </div>

        {/* Table of devices */}
        <div className="qrg-table-wrap">
          <table className="qrg-table">
            <thead>
              <tr>
                <th>#</th>
                <th>מספר מכשיר *</th>
                <th>מיקום / דירה</th>
                <th>תיאור (לתווית בלבד)</th>
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
                      placeholder="מ-12345"
                    />
                  </td>
                  <td>
                    <input
                      className="qrg-input"
                      value={row.location}
                      onChange={e => updateRow(row.id, 'location', e.target.value)}
                      placeholder="דירה 5 / קומה 3"
                    />
                  </td>
                  <td>
                    <input
                      className="qrg-input"
                      value={row.description}
                      onChange={e => updateRow(row.id, 'description', e.target.value)}
                      placeholder="מזגן סלון..."
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
              <button className="qrg-print-btn" onClick={handlePrint}>🖨️ הדפס הכל</button>
            </div>
            <div className="qrg-cards" ref={printRef}>
              {generated.map(item => (
                <div key={item.id} className="qrg-card">
                  <QRCodeCanvas
                    id={`qr-canvas-${item.id}`}
                    value={item.waLink}
                    size={180}
                    level="M"
                    includeMargin={true}
                  />
                  <div className="qrg-card-info">
                    <div className="qrg-card-device">{item.deviceNum}</div>
                    {item.location && <div className="qrg-card-location">{item.location}</div>}
                    {item.description && <div className="qrg-card-desc">{item.description}</div>}
                    <div className="qrg-card-wa">📱 סרוק לפתיחת WhatsApp</div>
                  </div>
                  <button
                    className="qrg-download-btn no-print"
                    onClick={() => downloadQr(item.id, item.deviceNum)}
                  >
                    ⬇ הורד PNG
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
