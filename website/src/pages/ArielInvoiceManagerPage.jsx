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

  // Close combo on outside click
  useEffect(() => {
    if (!comboOpen) return
    const handler = (e) => { if (comboRef.current && !comboRef.current.contains(e.target)) setComboOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [comboOpen])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState('')

  // Load customers on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/hr/customers`)
      .then(r => r.json())
      .then(data => { if (data.ok) setCustomers(data.customers || []) })
      .catch(() => {})
  }, [])

  const loadInvoices = async (custCode, custName) => {
    setSelectedCustomer({ code: custCode, name: custName })
    setInvoices([])
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/hr/customer-invoices?customer=${encodeURIComponent(custCode)}`)
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

  const filteredCustomers = customerSearch
    ? customers.filter(c => c.code.includes(customerSearch) || c.name.includes(customerSearch))
    : customers

  return (
    <div className="ariel-page">
      <div className="container">
        <Link to="/ariel" className="ariel-back">&rarr; חזרה לאריאל</Link>
        <h1 className="ariel-title">ניהול חשבוניות</h1>

        <div>
          {/* Customer combobox */}
          <div ref={comboRef} style={{ position: 'relative', maxWidth: '450px', marginBottom: '16px' }}>
            <h3>בחר לקוח</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
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

          {/* Invoices */}
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
                          <tr key={inv.ivnum}>
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
              <div style={{ color: '#888', marginTop: '40px', fontSize: '16px' }}>בחר לקוח מהרשימה כדי לראות חשבוניות</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
