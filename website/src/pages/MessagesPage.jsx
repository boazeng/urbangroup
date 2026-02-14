import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import './MessagesPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const STATUS_LABELS = {
  new: 'חדש',
  processing: 'בטיפול',
  completed: 'טופל',
  failed: 'נכשל',
}

const STATUS_CLASS = {
  new: 'msg-badge-new',
  processing: 'msg-badge-processing',
  completed: 'msg-badge-ok',
  failed: 'msg-badge-err',
}

export default function MessagesPage() {
  const { env } = useEnv()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  async function fetchMessages() {
    setLoading(true)
    setError(null)
    try {
      const params = filterStatus ? `?status=${filterStatus}&env=${env}` : `?env=${env}`
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
  }, [filterStatus, env])

  async function updateStatus(id, newStatus) {
    try {
      const res = await fetch(`${API_BASE}/api/messages/${id}/status?env=${env}`, {
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
    <div className="msg-page">
      <div className="container">
        <Link to="/maintenance" className="msg-back">&rarr; חזרה לאחזקה</Link>

        <div className="msg-header">
          <div className="msg-header-icon">💬</div>
          <div>
            <h1 className="msg-title">הודעות נכנסות</h1>
            <p className="msg-subtitle">הודעות WhatsApp שהתקבלו מהבוט</p>
          </div>
          <button className="msg-refresh-btn" onClick={fetchMessages} disabled={loading}>
            רענן
          </button>
        </div>

        {/* Filters */}
        <div className="msg-filters">
          <button
            className={`msg-filter-btn ${filterStatus === '' ? 'active' : ''}`}
            onClick={() => setFilterStatus('')}
          >
            הכל ({messages.length})
          </button>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`msg-filter-btn ${filterStatus === key ? 'active' : ''}`}
              onClick={() => setFilterStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {error && (
          <div className="msg-error">{error}</div>
        )}

        {loading ? (
          <div className="msg-loading">
            <div className="msg-spinner"></div>
            <span>טוען הודעות...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="msg-empty">אין הודעות להצגה</div>
        ) : (
          <div className="msg-card">
            <table className="msg-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>טלפון</th>
                  <th>שם</th>
                  <th>סוג</th>
                  <th>תוכן</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id} className={expandedId === msg.id ? 'msg-row-expanded' : ''}>
                    <td className="msg-cell-date">{formatDate(msg.created_at)}</td>
                    <td className="msg-cell-phone" dir="ltr">{msg.phone}</td>
                    <td>{msg.name || '-'}</td>
                    <td className="msg-cell-type">
                      <span className={`msg-type-badge msg-type-${msg.msg_type || 'text'}`}>
                        {msg.msg_type || 'text'}
                      </span>
                    </td>
                    <td className="msg-cell-text">
                      <div
                        className="msg-text-preview"
                        onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                        title="לחץ להרחבה"
                      >
                        {expandedId === msg.id ? msg.text : (msg.text || '').slice(0, 60) + ((msg.text || '').length > 60 ? '...' : '')}
                      </div>
                      {expandedId === msg.id && msg.parsed_data && (
                        <div className="msg-parsed">
                          {Object.entries(msg.parsed_data).map(([k, v]) => (
                            <div key={k} className="msg-parsed-row">
                              <span className="msg-parsed-key">{k}:</span>
                              <span className="msg-parsed-value">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`msg-badge ${STATUS_CLASS[msg.status] || ''}`}>
                        {STATUS_LABELS[msg.status] || msg.status}
                      </span>
                    </td>
                    <td className="msg-cell-actions">
                      {msg.status === 'new' && (
                        <button
                          className="msg-action-btn msg-action-process"
                          onClick={() => updateStatus(msg.id, 'processing')}
                        >
                          התחל טיפול
                        </button>
                      )}
                      {msg.status === 'processing' && (
                        <button
                          className="msg-action-btn msg-action-complete"
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
