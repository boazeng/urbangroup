import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './ArielPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

export default function ArielInvoiceManagerPage() {
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
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

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {/* Customers list */}
          <div style={{ flex: '0 0 350px' }}>
            <h3>בחר לקוח</h3>
            <input
              type="text"
              placeholder="חיפוש לקוח..."
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '8px', direction: 'rtl' }}
            />
            <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
              <table className="ariel-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>מספר</th>
                    <th>שם לקוח</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(c => (
                    <tr
                      key={c.code}
                      style={{ cursor: 'pointer', background: selectedCustomer?.code === c.code ? '#e3f2fd' : '' }}
                      onClick={() => loadInvoices(c.code, c.name)}
                    >
                      <td>{c.code}</td>
                      <td>{c.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoices */}
          <div style={{ flex: 1, minWidth: '400px' }}>
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
