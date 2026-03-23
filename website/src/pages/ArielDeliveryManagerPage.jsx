import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

export default function ArielDeliveryManagerPage() {
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [comboOpen, setComboOpen] = useState(false)
  const comboRef = useRef(null)

  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [topN, setTopN] = useState(10)
  const [selectedDocs, setSelectedDocs] = useState(new Set())
  const [sendMethod, setSendMethod] = useState('email')
  const [emailTo, setEmailTo] = useState('arielmpinfo@gmail.com')
  const [whatsappTo, setWhatsappTo] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!comboOpen) return
    const handler = (e) => { if (comboRef.current && !comboRef.current.contains(e.target)) setComboOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [comboOpen])

  useEffect(() => {
    fetch(`${API_BASE}/api/hr/customers`)
      .then(r => r.json())
      .then(data => { if (data.ok) setCustomers(data.customers || []) })
      .catch(() => {})
  }, [])

  const loadDocs = async (custCode, custName, limit) => {
    setSelectedCustomer({ code: custCode, name: custName })
    setDocs([])
    setSelectedDocs(new Set())
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/hr/customer-delivery-notes?customer=${encodeURIComponent(custCode)}&top=${limit || topN}`)
      const data = await resp.json()
      if (data.ok) setDocs(data.docs || [])
    } catch {}
    setLoading(false)
  }

  const downloadDoc = async (docno) => {
    setDownloading(docno)
    try {
      const resp = await fetch(`${API_BASE}/api/hr/delivery-note-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docno }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        alert(err.error || 'שגיאה בהורדה')
        return
      }
      const blob = await resp.blob()
      const filename = resp.headers.get('Content-Disposition')?.match(/filename="?(.+?)"?$/)?.[1] || `${docno}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`שגיאה: ${err.message}`)
    } finally {
      setDownloading('')
    }
  }

  const toggleSelect = (docno) => {
    setSelectedDocs(prev => {
      const next = new Set(prev)
      if (next.has(docno)) next.delete(docno)
      else next.add(docno)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedDocs.size === docs.length) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(docs.map(d => d.docno)))
    }
  }

  const handleSend = async () => {
    if (selectedDocs.size === 0) { alert('בחר תעודות לשליחה'); return }

    if (sendMethod === 'email') {
      if (!emailTo.trim()) { alert('הכנס כתובת מייל'); return }
      setSending(true)
      try {
        const resp = await fetch(`${API_BASE}/api/hr/send-delivery-notes-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailTo.trim(),
            docs: [...selectedDocs],
            customerName: selectedCustomer?.name || '',
          }),
        })
        const data = await resp.json()
        if (data.ok) {
          alert(`${selectedDocs.size} תעודות נשלחו ל-${emailTo} בהצלחה`)
          setSelectedDocs(new Set())
        } else {
          alert(`שגיאה: ${data.error}`)
        }
      } catch (err) {
        alert(`שגיאה: ${err.message}`)
      } finally {
        setSending(false)
      }
    } else {
      if (!whatsappTo.trim()) { alert('הכנס מספר וואטסאפ'); return }
      setSending(true)
      try {
        const resp = await fetch(`${API_BASE}/api/hr/send-delivery-notes-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: whatsappTo.trim(),
            docs: [...selectedDocs],
            customerName: selectedCustomer?.name || '',
          }),
        })
        const data = await resp.json()
        if (data.ok) {
          alert(`${selectedDocs.size} תעודות נשלחו לוואטסאפ ${whatsappTo} בהצלחה`)
          setSelectedDocs(new Set())
        } else {
          alert(`שגיאה: ${data.error}`)
        }
      } catch (err) {
        alert(`שגיאה: ${err.message}`)
      } finally {
        setSending(false)
      }
    }
  }

  const filteredCustomers = customerSearch
    ? customers.filter(c => c.code.includes(customerSearch) || c.name.includes(customerSearch))
    : customers

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>
        <h1 className="ariel-title">ניהול תעודות משלוח</h1>

        {/* Top controls */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div ref={comboRef} style={{ position: 'relative', minWidth: '350px', flex: '0 0 auto' }}>
            <label style={{ fontWeight: 'bold', fontSize: '14px' }}>לקוח</label>
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
              <input
                type="text"
                placeholder="הקלד שם או מספר לקוח..."
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setComboOpen(true) }}
                onFocus={() => setComboOpen(true)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #ccc', direction: 'rtl', fontSize: '14px' }}
              />
              <button
                onMouseDown={e => { e.preventDefault(); setComboOpen(v => !v) }}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ccc', background: '#f9fafb', cursor: 'pointer', fontSize: '12px' }}
              >&#9660;</button>
            </div>
            {comboOpen && (
              <div style={{
                position: 'absolute', zIndex: 100, background: '#fff', border: '1px solid #1976d2',
                borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxHeight: '300px', overflowY: 'auto', width: '100%', top: '100%', marginTop: '2px',
              }}>
                {filteredCustomers.length === 0 ? (
                  <div style={{ padding: '10px 14px', color: '#888' }}>לא נמצאו לקוחות</div>
                ) : filteredCustomers.map(c => (
                  <div
                    key={c.code}
                    onMouseDown={() => {
                      setCustomerSearch(`${c.name} (${c.code})`)
                      setComboOpen(false)
                      loadDocs(c.code, c.name)
                    }}
                    style={{
                      padding: '6px 14px', cursor: 'pointer', fontSize: '13px', direction: 'rtl',
                      background: selectedCustomer?.code === c.code ? '#e3f2fd' : '',
                    }}
                    onMouseEnter={e => e.target.style.background = '#e3f2fd'}
                    onMouseLeave={e => e.target.style.background = selectedCustomer?.code === c.code ? '#e3f2fd' : ''}
                  >
                    {c.code} — {c.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontWeight: 'bold', fontSize: '14px' }}>כמות</label>
            <select
              value={topN}
              onChange={e => {
                const val = Number(e.target.value)
                setTopN(val)
                if (selectedCustomer) loadDocs(selectedCustomer.code, selectedCustomer.name, val)
              }}
              style={{ display: 'block', marginTop: '4px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Send section */}
        <div style={{
          padding: '12px 16px', background: '#f0f7ff', borderRadius: '8px',
          border: '1px solid #90caf9', marginBottom: '16px',
          display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 'bold' }}>שליחה:</span>
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #ccc' }}>
            <button onClick={() => setSendMethod('email')} style={{
              padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: '13px',
              background: sendMethod === 'email' ? '#1976d2' : '#f9fafb', color: sendMethod === 'email' ? '#fff' : '#333',
            }}>מייל</button>
            <button onClick={() => setSendMethod('whatsapp')} style={{
              padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: '13px',
              background: sendMethod === 'whatsapp' ? '#25d366' : '#f9fafb', color: sendMethod === 'whatsapp' ? '#fff' : '#333',
            }}>וואטסאפ</button>
          </div>
          {sendMethod === 'email' ? (
            <input type="email" placeholder="כתובת מייל..." value={emailTo} onChange={e => setEmailTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', minWidth: '250px', direction: 'ltr' }} />
          ) : (
            <input type="tel" placeholder="מספר וואטסאפ (972...)..." value={whatsappTo} onChange={e => setWhatsappTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', minWidth: '200px', direction: 'ltr' }} />
          )}
          <button onClick={handleSend} disabled={sending || selectedDocs.size === 0} style={{
            background: selectedDocs.size > 0 ? (sendMethod === 'email' ? '#1976d2' : '#25d366') : '#ccc',
            color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px',
            cursor: selectedDocs.size > 0 ? 'pointer' : 'default', fontSize: '14px',
          }}>
            {sending ? 'שולח...' : `שלח ${selectedDocs.size > 0 ? `(${selectedDocs.size})` : ''}`}
          </button>
        </div>

        {/* Docs table */}
        <div>
          {selectedCustomer ? (
            <>
              <h3>תעודות משלוח — {selectedCustomer.name} ({selectedCustomer.code})</h3>
              {loading ? (
                <div style={{ color: '#888' }}>טוען תעודות...</div>
              ) : docs.length === 0 ? (
                <div style={{ color: '#888' }}>לא נמצאו תעודות משלוח</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="ariel-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }}>
                          <input type="checkbox" checked={selectedDocs.size === docs.length && docs.length > 0} onChange={toggleSelectAll} />
                        </th>
                        <th>מספר תעודה</th>
                        <th>אתר</th>
                        <th>פרטים</th>
                        <th>תאריך</th>
                        <th>לפני מע&quot;מ</th>
                        <th>כולל מע&quot;מ</th>
                        <th>חויבה</th>
                        <th>הורדה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map(d => (
                        <tr key={d.docno} style={{ background: selectedDocs.has(d.docno) ? '#e8f5e9' : '' }}>
                          <td><input type="checkbox" checked={selectedDocs.has(d.docno)} onChange={() => toggleSelect(d.docno)} /></td>
                          <td>{d.docno}</td>
                          <td>{d.site || ''}</td>
                          <td>{d.details || ''}</td>
                          <td>{d.date ? new Date(d.date).toLocaleDateString('he-IL') : ''}</td>
                          <td style={{ textAlign: 'left' }}>{d.priceBeforeVat?.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'left' }}>{d.totalPrice?.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'center', color: d.charged ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
                            {d.charged ? 'כן' : 'לא'}
                          </td>
                          <td>
                            <button
                              onClick={() => downloadDoc(d.docno)}
                              disabled={downloading === d.docno}
                              style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              {downloading === d.docno ? '...' : 'PDF'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#888', marginTop: '20px', fontSize: '16px' }}>בחר לקוח כדי לראות תעודות משלוח</div>
          )}
        </div>
      </div>
    </div>
  )
}
