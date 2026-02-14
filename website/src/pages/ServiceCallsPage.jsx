import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useEnv } from '../contexts/EnvContext'
import './ServiceCallsPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const STATUS_LABELS = {
  new: 'חדש',
  assigned: 'שויך',
  in_progress: 'בטיפול',
  completed: 'טופל',
  cancelled: 'בוטל',
}

const STATUS_CLASS = {
  new: 'sc-badge-new',
  assigned: 'sc-badge-assigned',
  in_progress: 'sc-badge-progress',
  completed: 'sc-badge-ok',
  cancelled: 'sc-badge-cancelled',
}

const URGENCY_LABELS = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
  critical: 'קריטית',
}

const URGENCY_CLASS = {
  low: 'sc-urg-low',
  medium: 'sc-urg-medium',
  high: 'sc-urg-high',
  critical: 'sc-urg-critical',
}

const BRANCH_LABELS = {
  '108': 'אנרגיה',
  '026': 'חניה',
  '001': 'כללי',
}

export default function ServiceCallsPage() {
  const { env } = useEnv()
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [pushingId, setPushingId] = useState(null)
  const [pushResult, setPushResult] = useState(null)

  async function fetchCalls() {
    setLoading(true)
    setError(null)
    try {
      const params = filterStatus ? `?status=${filterStatus}&env=${env}` : `?env=${env}`
      const res = await fetch(`${API_BASE}/api/service-calls${params}`)
      const data = await res.json()
      if (data.ok) {
        setCalls(data.service_calls)
      } else {
        setError(data.error || 'שגיאה בטעינת קריאות השירות')
      }
    } catch (e) {
      setError('לא ניתן להתחבר לשרת')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCalls()
  }, [filterStatus, env])

  async function updateStatus(id, newStatus) {
    try {
      const res = await fetch(`${API_BASE}/api/service-calls/${id}/status?env=${env}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.ok) {
        setCalls((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
        )
      }
    } catch (e) {
      // ignore
    }
  }

  async function pushToPriority(id) {
    setPushingId(id)
    setPushResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/service-calls/${id}/push?env=${env}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.ok) {
        setPushResult({ id, ok: true, callno: data.callno })
        setCalls((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, priority_pushed: true, priority_callno: data.callno }
              : c
          )
        )
      } else {
        setPushResult({ id, ok: false, error: data.error })
      }
    } catch (e) {
      setPushResult({ id, ok: false, error: 'שגיאה בתקשורת עם השרת' })
    }
    setPushingId(null)
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
    <div className="sc-page">
      <div className="container">
        <Link to="/maintenance" className="sc-back">&rarr; חזרה לאחזקה</Link>

        <div className="sc-header">
          <div className="sc-header-icon">🔧</div>
          <div>
            <h1 className="sc-title">קריאות שירות</h1>
            <p className="sc-subtitle">קריאות שירות שזוהו אוטומטית מהודעות WhatsApp</p>
          </div>
          <button className="sc-refresh-btn" onClick={fetchCalls} disabled={loading}>
            רענן
          </button>
        </div>

        {/* Filters */}
        <div className="sc-filters">
          <button
            className={`sc-filter-btn ${filterStatus === '' ? 'active' : ''}`}
            onClick={() => setFilterStatus('')}
          >
            הכל ({calls.length})
          </button>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`sc-filter-btn ${filterStatus === key ? 'active' : ''}`}
              onClick={() => setFilterStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Push result banners */}
        {pushResult && pushResult.ok && (
          <div className="sc-success">קריאת שירות נשלחה בהצלחה לפריוריטי! מספר: {pushResult.callno}</div>
        )}
        {pushResult && !pushResult.ok && (
          <div className="sc-error">שגיאה בשליחה לפריוריטי: {pushResult.error}</div>
        )}

        {/* Content */}
        {error && (
          <div className="sc-error">{error}</div>
        )}

        {loading ? (
          <div className="sc-loading">
            <div className="sc-spinner"></div>
            <span>טוען קריאות שירות...</span>
          </div>
        ) : calls.length === 0 ? (
          <div className="sc-empty">אין קריאות שירות להצגה</div>
        ) : (
          <div className="sc-card">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>טלפון</th>
                  <th>שם</th>
                  <th>מס׳ לקוח</th>
                  <th>סניף</th>
                  <th>סוג תקלה</th>
                  <th>כתובת</th>
                  <th>מושבת</th>
                  <th>דחיפות</th>
                  <th>תיאור</th>
                  <th>סטטוס</th>
                  <th>פריוריטי</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id} className={expandedId === call.id ? 'sc-row-expanded' : ''}>
                    <td className="sc-cell-date">{formatDate(call.created_at)}</td>
                    <td className="sc-cell-phone" dir="ltr">{call.phone}</td>
                    <td>{call.name || '-'}</td>
                    <td className="sc-cell-cust">{call.custname && call.custname !== '99999' ? call.custname : '-'}</td>
                    <td>
                      <span className={`sc-branch-badge sc-branch-${call.branchname || '001'}`}>
                        {BRANCH_LABELS[call.branchname] || call.branchname || '-'}
                      </span>
                    </td>
                    <td className="sc-cell-type">{call.issue_type || '-'}</td>
                    <td className="sc-cell-location">{call.location || '-'}</td>
                    <td>
                      {call.is_system_down ? (
                        <span className="sc-down-badge sc-down-yes">כן</span>
                      ) : (
                        <span className="sc-down-badge sc-down-no">לא</span>
                      )}
                    </td>
                    <td>
                      <span className={`sc-urg-badge ${URGENCY_CLASS[call.urgency] || ''}`}>
                        {URGENCY_LABELS[call.urgency] || call.urgency}
                      </span>
                    </td>
                    <td className="sc-cell-desc">
                      <div
                        className="sc-desc-preview"
                        onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                        title="לחץ להרחבה"
                      >
                        {expandedId === call.id
                          ? call.description
                          : (call.description || '').slice(0, 60) + ((call.description || '').length > 60 ? '...' : '')}
                      </div>
                      {expandedId === call.id && (
                        <div className="sc-details">
                          {call.summary && (
                            <div className="sc-detail-row">
                              <span className="sc-detail-key">תמצית:</span>
                              <span>{call.summary}</span>
                            </div>
                          )}
                          {call.sernum && (
                            <div className="sc-detail-row">
                              <span className="sc-detail-key">מכשיר:</span>
                              <span>{call.sernum}</span>
                            </div>
                          )}
                          {call.contact_name && (
                            <div className="sc-detail-row">
                              <span className="sc-detail-key">איש קשר:</span>
                              <span>{call.contact_name}</span>
                            </div>
                          )}
                          {call.cdes && (
                            <div className="sc-detail-row">
                              <span className="sc-detail-key">שם לקוח:</span>
                              <span>{call.cdes}</span>
                            </div>
                          )}
                          {call.technicianlogin && (
                            <div className="sc-detail-row">
                              <span className="sc-detail-key">טכנאי:</span>
                              <span>{call.technicianlogin}</span>
                            </div>
                          )}
                          {call.callstatuscode && (
                            <div className="sc-detail-row">
                              <span className="sc-detail-key">סטטוס פריוריטי:</span>
                              <span>{call.callstatuscode}</span>
                            </div>
                          )}
                          {call.breakstart && (
                            <div className="sc-detail-row">
                              <span className="sc-detail-key">תחילת השבתה:</span>
                              <span>{call.breakstart}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`sc-badge ${STATUS_CLASS[call.status] || ''}`}>
                        {STATUS_LABELS[call.status] || call.status}
                      </span>
                    </td>
                    <td className="sc-cell-priority">
                      {call.priority_pushed ? (
                        <span className="sc-badge sc-badge-ok" title={call.priority_callno || ''}>
                          {call.priority_callno || 'נשלח'}
                        </span>
                      ) : (
                        <button
                          className="sc-action-btn sc-action-push"
                          onClick={() => pushToPriority(call.id)}
                          disabled={pushingId === call.id}
                        >
                          {pushingId === call.id ? 'שולח...' : 'שלח לפריוריטי'}
                        </button>
                      )}
                    </td>
                    <td className="sc-cell-actions">
                      {call.status === 'new' && (
                        <button
                          className="sc-action-btn sc-action-assign"
                          onClick={() => updateStatus(call.id, 'assigned')}
                        >
                          שייך
                        </button>
                      )}
                      {call.status === 'assigned' && (
                        <button
                          className="sc-action-btn sc-action-progress"
                          onClick={() => updateStatus(call.id, 'in_progress')}
                        >
                          התחל טיפול
                        </button>
                      )}
                      {call.status === 'in_progress' && (
                        <button
                          className="sc-action-btn sc-action-complete"
                          onClick={() => updateStatus(call.id, 'completed')}
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
