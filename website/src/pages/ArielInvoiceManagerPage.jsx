import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

export default function ArielInvoiceManagerPage() {
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [comboOpen, setComboOpen] = useState(false)
  const comboRef = useRef(null)

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [topN, setTopN] = useState(10)
  const [selectedInvoices, setSelectedInvoices] = useState(new Set())
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

  const loadInvoices = async (custCode, custName, limit) => {
    setSelectedCustomer({ code: custCode, name: custName })
    setInvoices([])
    setSelectedInvoices(new Set())
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/hr/customer-invoices?customer=${encodeURIComponent(custCode)}&top=${limit || topN}`)
      const data = await resp.json()
      if (data.ok) setInvoices(data.invoices || [])
    } catch {}
    setLoading(false)
  }

  const downloadInvoice = async (ivnum) => {
    setDownloading(ivnum)
    try {
      const resp = await fetch(`${API_BASE}/api/hr/cinvoice-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ivnum }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        alert(err.error || 'שגיאה בהורדה')
        return
      }
      const blob = await resp.blob()
      const filename = resp.headers.get('Content-Disposition')?.match(/filename="?(.+?)"?$/)?.[1] || `${ivnum}.pdf`
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

  const toggleSelect = (ivnum) => {
    setSelectedInvoices(prev => {
      const next = new Set(prev)
      if (next.has(ivnum)) next.delete(ivnum)
      else next.add(ivnum)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedInvoices.size === invoices.length) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(invoices.map(inv => inv.ivnum)))
    }
  }

  const handleSend = async () => {
    if (selectedInvoices.size === 0) { alert('בחר חשבוניות לשליחה'); return }

    if (sendMethod === 'email') {
      if (!emailTo.trim()) { alert('הכנס כתובת מייל'); return }
      setSending(true)
      try {
        const resp = await fetch(`${API_BASE}/api/hr/send-invoices-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: emailTo.trim(),
            invoices: [...selectedInvoices],
            customerName: selectedCustomer?.name || '',
          }),
        })
        const data = await resp.json()
        if (data.ok) {
          alert(`${selectedInvoices.size} חשבוניות נשלחו ל-${emailTo} בהצלחה`)
          setSelectedInvoices(new Set())
        } else {
          alert(`שגיאה: ${data.error}`)
        }
      } catch (err) {
        alert(`שגיאה: ${err.message}`)
      } finally {
        setSending(false)
      }
    } else {
      // WhatsApp
      if (!whatsappTo.trim()) { alert('הכנס מספר וואטסאפ'); return }
      setSending(true)
      try {
        const resp = await fetch(`${API_BASE}/api/hr/send-invoices-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: whatsappTo.trim(),
            invoices: [...selectedInvoices],
            customerName: selectedCustomer?.name || '',
          }),
        })
        const data = await resp.json()
        if (data.ok) {
          alert(`${selectedInvoices.size} חשבוניות נשלחו לוואטסאפ ${whatsappTo} בהצלחה`)
          setSelectedInvoices(new Set())
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
        <h1 className="ariel-title">ניהול חשבוניות</h1>

        {/* Top controls: customer + count + send method */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
          {/* Customer combobox */}
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
                      loadInvoices(c.code, c.name)
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

          {/* Invoice count */}
          <div>
            <label style={{ fontWeight: 'bold', fontSize: '14px' }}>כמות</label>
            <select
              value={topN}
              onChange={e => {
                const val = Number(e.target.value)
                setTopN(val)
                if (selectedCustomer) loadInvoices(selectedCustomer.code, selectedCustomer.name, val)
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

        {/* Send section - always visible */}
        <div style={{
          padding: '12px 16px', background: '#f0f7ff', borderRadius: '8px',
          border: '1px solid #90caf9', marginBottom: '16px',
          display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 'bold' }}>שליחה:</span>

          {/* Method toggle */}
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #ccc' }}>
            <button
              onClick={() => setSendMethod('email')}
              style={{
                padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: '13px',
                background: sendMethod === 'email' ? '#1976d2' : '#f9fafb',
                color: sendMethod === 'email' ? '#fff' : '#333',
              }}
            >מייל</button>
            <button
              onClick={() => setSendMethod('whatsapp')}
              style={{
                padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: '13px',
                background: sendMethod === 'whatsapp' ? '#25d366' : '#f9fafb',
                color: sendMethod === 'whatsapp' ? '#fff' : '#333',
              }}
            >וואטסאפ</button>
          </div>

          {/* Destination input */}
          {sendMethod === 'email' ? (
            <input
              type="email"
              placeholder="כתובת מייל..."
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', minWidth: '250px', direction: 'ltr' }}
            />
          ) : (
            <input
              type="tel"
              placeholder="מספר וואטסאפ (972...)..."
              value={whatsappTo}
              onChange={e => setWhatsappTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', minWidth: '200px', direction: 'ltr' }}
            />
          )}

          <button
            onClick={handleSend}
            disabled={sending || selectedInvoices.size === 0}
            style={{
              background: selectedInvoices.size > 0 ? (sendMethod === 'email' ? '#1976d2' : '#25d366') : '#ccc',
              color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px',
              cursor: selectedInvoices.size > 0 ? 'pointer' : 'default', fontSize: '14px',
            }}
          >
            {sending ? 'שולח...' : `שלח ${selectedInvoices.size > 0 ? `(${selectedInvoices.size})` : ''}`}
          </button>
        </div>

        {/* Invoices table */}
        <div>
          {selectedCustomer ? (
            <>
              <h3>חשבוניות — {selectedCustomer.name} ({selectedCustomer.code})</h3>
              {loading ? (
                <div style={{ color: '#888' }}>טוען חשבוניות...</div>
              ) : invoices.length === 0 ? (
                <div style={{ color: '#888' }}>לא נמצאו חשבוניות</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="ariel-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }}>
                          <input type="checkbox" checked={selectedInvoices.size === invoices.length && invoices.length > 0} onChange={toggleSelectAll} />
                        </th>
                        <th>מספר חשבונית</th>
                        <th>אתר</th>
                        <th>פרטים</th>
                        <th>תאריך</th>
                        <th>לפני מע&quot;מ</th>
                        <th>כולל מע&quot;מ</th>
                        <th>הורדה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.ivnum} style={{ background: selectedInvoices.has(inv.ivnum) ? '#e8f5e9' : '' }}>
                          <td><input type="checkbox" checked={selectedInvoices.has(inv.ivnum)} onChange={() => toggleSelect(inv.ivnum)} /></td>
                          <td>{inv.ivnum}</td>
                          <td>{inv.site || ''}</td>
                          <td>{inv.details || ''}</td>
                          <td>{inv.date ? new Date(inv.date).toLocaleDateString('he-IL') : ''}</td>
                          <td style={{ textAlign: 'left' }}>{inv.priceBeforeVat?.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'left' }}>{inv.totalPrice?.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</td>
                          <td>
                            <button
                              onClick={() => downloadInvoice(inv.ivnum)}
                              disabled={downloading === inv.ivnum}
                              style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px' }}
                            >
                              {downloading === inv.ivnum ? '...' : 'PDF'}
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
            <div style={{ color: '#888', marginTop: '20px', fontSize: '16px' }}>בחר לקוח כדי לראות חשבוניות</div>
          )}
        </div>
      </div>
    </div>
  )
}
