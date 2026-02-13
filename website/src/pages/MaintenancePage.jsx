import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './MaintenancePage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const STATUS_LABELS = {
  new: 'חדש',
  processing: 'בטיפול',
  completed: 'טופל',
  failed: 'נכשל',
}

const STATUS_CLASS = {
  new: 'mnt-badge-new',
  processing: 'mnt-badge-processing',
  completed: 'mnt-badge-ok',
  failed: 'mnt-badge-err',
}

export default function MaintenancePage() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  async function fetchMessages() {
    setLoading(true)
    setError(null)
    try {
      const params = filterStatus ? `?status=${filterStatus}` : ''
      const res = await fetch(`${API_BASE}/api/messages${params}`)
      const data = await res.json()
      if (data.ok) {
        setMessages(data.messages)
      } else {
        setError(data.error || 'שגיאה בטעינת ההודעות')
      }
    } catch (e) {
      setError('לא ניתן להתחבר לשרת')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchMessages()
  }, [filterStatus])

  async function updateStatus(id, newStatus) {
    try {
      const res = await fetch(`${API_BASE}/api/messages/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
        )
      }
    } catch (e) {
      // ignore
    }
  }

  function formatDate(isoStr) {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    return d.toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="mnt-page">
      <div className="container">
        <Link to="/" className="mnt-back">&rarr; חזרה לדף הבית</Link>

        <div className="mnt-header">
          <div className="mnt-header-icon">🔧</div>
          <div>
            <h1 className="mnt-title">אחזקה - הודעות נכנסות</h1>
            <p className="mnt-subtitle">הודעות WhatsApp שהתקבלו מהבוט הקולי</p>
          </div>
          <button className="mnt-refresh-btn" onClick={fetchMessages} disabled={loading}>
            רענן
          </button>
        </div>

        {/* Filters */}
        <div className="mnt-filters">
          <button
            className={`mnt-filter-btn ${filterStatus === '' ? 'active' : ''}`}
            onClick={() => setFilterStatus('')}
          >
            הכל ({messages.length})
          </button>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`mnt-filter-btn ${filterStatus === key ? 'active' : ''}`}
              onClick={() => setFilterStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {error && (
          <div className="mnt-error">{error}</div>
        )}

        {loading ? (
          <div className="mnt-loading">
            <div className="mnt-spinner"></div>
            <span>טוען הודעות...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="mnt-empty">אין הודעות להצגה</div>
        ) : (
          <div className="mnt-card">
            <table className="mnt-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>טלפון</th>
                  <th>שם</th>
                  <th>תוכן</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id} className={expandedId === msg.id ? 'mnt-row-expanded' : ''}>
                    <td className="mnt-cell-date">{formatDate(msg.created_at)}</td>
                    <td className="mnt-cell-phone" dir="ltr">{msg.phone}</td>
                    <td>{msg.name || '-'}</td>
                    <td className="mnt-cell-text">
                      <div
                        className="mnt-text-preview"
                        onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                        title="לחץ להרחבה"
                      >
                        {expandedId === msg.id ? msg.text : (msg.text || '').slice(0, 60) + ((msg.text || '').length > 60 ? '...' : '')}
                      </div>
                      {expandedId === msg.id && msg.parsed_data && (
                        <div className="mnt-parsed">
                          {Object.entries(msg.parsed_data).map(([k, v]) => (
                            <div key={k} className="mnt-parsed-row">
                              <span className="mnt-parsed-key">{k}:</span>
                              <span className="mnt-parsed-value">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`mnt-badge ${STATUS_CLASS[msg.status] || ''}`}>
                        {STATUS_LABELS[msg.status] || msg.status}
                      </span>
                    </td>
                    <td className="mnt-cell-actions">
                      {msg.status === 'new' && (
                        <button
                          className="mnt-action-btn mnt-action-process"
                          onClick={() => updateStatus(msg.id, 'processing')}
                        >
                          התחל טיפול
                        </button>
                      )}
                      {msg.status === 'processing' && (
                        <button
                          className="mnt-action-btn mnt-action-complete"
                          onClick={() => updateStatus(msg.id, 'completed')}
                        >
                          סיים
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
