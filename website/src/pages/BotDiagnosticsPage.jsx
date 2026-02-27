import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import './BotDiagnosticsPage.css'

// ── Event rendering ────────────────────────────────────────────

const EVENT_META = {
  session_start:       { icon: '🚀', label: 'שיחה התחילה' },
  step_shown:          { icon: '📤', label: 'הצגת שלב' },
  user_input:          { icon: '📥', label: 'קלט משתמש' },
  button_matched:      { icon: '🖱️', label: 'כפתור נבחר' },
  skip_if_triggered:   { icon: '⏭️', label: 'דילוג אוטומטי' },
  action_executed:     { icon: '⚡', label: 'פעולה בוצעה' },
  llm_route:           { icon: '🧠', label: 'החלטת AI' },
  instructions_auto:   { icon: '📝', label: 'הוראות אוטומטיות' },
  switch_script:       { icon: '🔀', label: 'מעבר לתסריט' },
  session_done:        { icon: '✅', label: 'סיום שיחה' },
}

function eventDescription(entry) {
  const { event } = entry
  switch (event) {
    case 'session_start':
      return `תסריט: ${entry.script_id}${entry.customer_name ? ` | לקוח: ${entry.customer_name}` : ''}${entry.device_number ? ` | מכשיר: ${entry.device_number}` : ''}`
    case 'step_shown':
      return `[${entry.step}] ${entry.text || ''}`
    case 'user_input':
      return `"${entry.input || ''}"${entry.save_to ? ` → נשמר ב: ${entry.save_to}` : ''}`
    case 'button_matched':
      return `"${entry.button_title || entry.button_id}" → ${entry.next_step}`
    case 'skip_if_triggered':
      return `שדה "${entry.field}" → ${entry.target}`
    case 'action_executed': {
      const ok = entry.result === 'success'
      return `${entry.action_type} (${entry.field}=${entry.value}) — ${ok ? '✓ הצלחה' : '✕ כישלון'} → ${entry.target}`
    }
    case 'llm_route':
      return `"${entry.chosen_exit_title}" → ${entry.target}`
    case 'instructions_auto':
      return `→ ${entry.target}`
    case 'switch_script':
      return `${entry.from_script} → ${entry.to_script}`
    case 'session_done':
      return `${entry.done_id} (${entry.action})`
    default:
      return JSON.stringify(entry)
  }
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return isoStr }
}

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleString('he-IL')
  } catch { return isoStr }
}

// ── Session timeline ───────────────────────────────────────────

function SessionTimeline({ session }) {
  const log = session.session_log || []
  if (log.length === 0) {
    return <div className="bd-empty-log">אין לוג פעילות לשיחה זו</div>
  }
  return (
    <div className="bd-timeline">
      {log.map((entry, i) => {
        const meta = EVENT_META[entry.event] || { icon: '•', label: entry.event }
        const isError = entry.result === 'failure'
        const isDone = entry.event === 'session_done'
        return (
          <div
            key={i}
            className={`bd-event${isError ? ' bd-event-error' : ''}${isDone ? ' bd-event-done' : ''}`}
          >
            <span className="bd-event-icon">{meta.icon}</span>
            <div className="bd-event-body">
              <span className="bd-event-label">{meta.label}</span>
              <span className="bd-event-desc">{eventDescription(entry)}</span>
            </div>
            <span className="bd-event-time">{formatTime(entry.ts)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Session list card ──────────────────────────────────────────

function SessionCard({ session, selected, onClick }) {
  const isDone = session.status === 'done'
  const name = session.customer_name || session.name || session.phone
  const steps = (session.session_log || []).length
  return (
    <div
      className={`bd-session-card${selected ? ' bd-session-card-selected' : ''}`}
      onClick={onClick}
    >
      <div className="bd-session-status">
        <span className={`bd-status-badge ${isDone ? 'bd-status-done' : 'bd-status-active'}`}>
          {isDone ? '✓ הסתיים' : '● פעיל'}
        </span>
        <span className="bd-session-steps">{steps} אירועים</span>
      </div>
      <div className="bd-session-name">{name}</div>
      <div className="bd-session-meta">
        {session.script_id && <span>📋 {session.script_id}</span>}
        {session.device_number && <span>🔧 {session.device_number}</span>}
      </div>
      <div className="bd-session-time">{formatDateTime(session.created_at)}</div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────

export default function BotDiagnosticsPage() {
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/bot-sessions')
      const data = await res.json()
      if (data.ok) {
        setSessions(data.sessions)
        // Keep selected in sync if it was already chosen
        if (selected) {
          const updated = data.sessions.find(s => s.phone === selected.phone)
          if (updated) setSelected(updated)
        }
        setError(null)
      } else {
        setError(data.error)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [selected])

  useEffect(() => {
    fetchSessions()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchSessions, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchSessions])

  return (
    <div className="bd-page">
      <div className="bd-topbar">
        <Link to="/maintenance" className="bd-back">→ חזרה לאחזקה</Link>
        <h1 className="bd-title">🔍 אבחון בוט</h1>
        <div className="bd-toolbar-right">
          <label className="bd-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            רענון אוטומטי (5 שנ')
          </label>
          <button className="bd-refresh-btn" onClick={fetchSessions}>↻ רענן</button>
        </div>
      </div>

      {error && <div className="bd-error">שגיאה: {error}</div>}

      <div className="bd-body">
        {/* Left: session list */}
        <div className="bd-list-panel">
          <div className="bd-list-header">
            שיחות אחרונות ({sessions.length})
          </div>
          {loading && <div className="bd-loading">טוען...</div>}
          {!loading && sessions.length === 0 && (
            <div className="bd-empty">אין שיחות — שלח הודעה לבוט כדי להתחיל</div>
          )}
          {sessions.map(s => (
            <SessionCard
              key={s.phone}
              session={s}
              selected={selected?.phone === s.phone}
              onClick={() => setSelected(s)}
            />
          ))}
        </div>

        {/* Right: timeline */}
        <div className="bd-detail-panel">
          {!selected ? (
            <div className="bd-no-selection">
              <span className="bd-no-selection-icon">🔍</span>
              <p>בחר שיחה מהרשימה כדי לראות את לוג הפעילות</p>
            </div>
          ) : (
            <>
              <div className="bd-detail-header">
                <div>
                  <span className="bd-detail-name">
                    {selected.customer_name || selected.name || selected.phone}
                  </span>
                  <span className="bd-detail-phone">{selected.phone}</span>
                </div>
                <div className="bd-detail-meta">
                  {selected.script_id && <span>📋 {selected.script_id}</span>}
                  {selected.device_number && <span>🔧 {selected.device_number}</span>}
                  {selected.step && <span>📍 צעד נוכחי: {selected.step}</span>}
                </div>
                <div className="bd-detail-times">
                  <span>התחיל: {formatDateTime(selected.created_at)}</span>
                  {selected.updated_at !== selected.created_at && (
                    <span>עדכון: {formatDateTime(selected.updated_at)}</span>
                  )}
                </div>
              </div>
              <SessionTimeline session={selected} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
