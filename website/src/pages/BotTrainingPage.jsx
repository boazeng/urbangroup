import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import './BotTrainingPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const LLM_FIELDS = [
  'is_service_call', 'issue_type', 'description', 'urgency',
  'location', 'summary', 'branch_context', 'customer_number',
  'customer_name', 'device_number', 'contact_name', 'is_system_down',
]

const STATUS_LABELS = {
  new: 'חדש',
  assigned: 'שויך',
  in_progress: 'בטיפול',
  completed: 'טופל',
  cancelled: 'בוטל',
}

const STATUS_CLASS = {
  new: 'bt-badge-new',
  assigned: 'bt-badge-assigned',
  in_progress: 'bt-badge-progress',
  completed: 'bt-badge-ok',
  cancelled: 'bt-badge-cancelled',
}

const URGENCY_LABELS = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
  critical: 'קריטית',
}

const URGENCY_CLASS = {
  low: 'bt-urg-low',
  medium: 'bt-urg-medium',
  high: 'bt-urg-high',
  critical: 'bt-urg-critical',
}

const TYPE_LABELS = {
  manual: 'ידני',
  feedback: 'הערה על שיחה',
  document: 'מסמך',
}

export default function BotTrainingPage() {
  const [activeTab, setActiveTab] = useState('knowledge')

  return (
    <div className="bt-page">
      <div className="container">
        <Link to="/maintenance" className="bt-back">&rarr; חזרה לאחזקה</Link>

        <div className="bt-header">
          <h1 className="bt-title">אימון הבוט</h1>
        </div>

        <div className="bt-tabs">
          <button
            className={`bt-tab ${activeTab === 'knowledge' ? 'bt-tab-active' : ''}`}
            onClick={() => setActiveTab('knowledge')}
          >
            בסיס ידע
          </button>
          <button
            className={`bt-tab ${activeTab === 'history' ? 'bt-tab-active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            היסטוריית שיחות
          </button>
          <button
            className={`bt-tab ${activeTab === 'prompt' ? 'bt-tab-active' : ''}`}
            onClick={() => setActiveTab('prompt')}
          >
            עורך Prompt
          </button>
        </div>

        {activeTab === 'knowledge' && <KnowledgeBase />}
        {activeTab === 'history' && <ConversationHistory />}
        {activeTab === 'prompt' && <PromptEditor />}
      </div>
    </div>
  )
}


/* ── Knowledge Base Tab ────────────────────── */

function KnowledgeBase() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  // New item form
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState('manual')
  const [newTags, setNewTags] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/knowledge`)
      const data = await res.json()
      if (data.ok) {
        setItems(data.items || [])
      } else {
        setError(data.error || 'שגיאה בטעינת בסיס הידע')
      }
    } catch (e) {
      setError('שגיאה בטעינה: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!newTitle.trim() || !newContent.trim()) return
    setAdding(true)
    setError(null)
    setSuccess(null)
    try {
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean)
      const res = await fetch(`${API_BASE}/api/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, content: newContent, type: newType, tags }),
      })
      const data = await res.json()
      if (data.ok) {
        setSuccess(`פריט ידע נוסף בהצלחה${data.has_embedding ? ' (עם embedding)' : ''}`)
        setNewTitle('')
        setNewContent('')
        setNewTags('')
        setTimeout(() => setSuccess(null), 4000)
        fetchItems()
      } else {
        setError(data.error || 'שגיאה בהוספה')
      }
    } catch (e) {
      setError('שגיאה: ' + e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(itemId) {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${itemId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setItems(prev => prev.filter(i => i.id !== itemId))
      }
    } catch (e) {
      setError('שגיאה במחיקה: ' + e.message)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleDateString('he-IL')
    } catch {
      return dateStr
    }
  }

  if (loading) return <div className="bt-loading">טוען בסיס ידע...</div>

  return (
    <>
      {error && <div className="bt-error">{error}</div>}
      {success && <div className="bt-success">{success}</div>}

      {/* Add new knowledge item */}
      <div className="bt-section">
        <h2 className="bt-section-title">הוספת ידע חדש</h2>

        <div className="bt-info-box">
          <div className="bt-info-box-title">איך זה עובד?</div>
          <span style={{ fontSize: '13px' }}>
            כל פריט ידע שתוסיף יהפוך לחלק מה-"זיכרון" של הבוט.
            כשלקוח שולח הודעה, המערכת מחפשת ידע רלוונטי ומזינה אותו ל-AI כדי לשפר את הניתוח.
          </span>
        </div>

        <div className="bt-field">
          <label>כותרת</label>
          <input
            className="bt-input"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="לדוגמה: מטען שלא נטען - פתרון מוכר"
          />
        </div>

        <div className="bt-field">
          <label>תוכן הידע</label>
          <textarea
            className="bt-prompt-textarea"
            style={{ minHeight: '150px' }}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="תאר את הידע שהבוט צריך לדעת. לדוגמה: כשלקוח מדווח שהמטען לא נטען, בדרך כלל מדובר בתקלת חשמל באזור ה..."
          />
        </div>

        <div className="bt-row-fields">
          <div className="bt-field" style={{ flex: 1 }}>
            <label>סוג</label>
            <select className="bt-filter-select" value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="manual">ידע ידני</option>
              <option value="document">מסמך</option>
            </select>
          </div>
          <div className="bt-field" style={{ flex: 2 }}>
            <label>תגיות (מופרדות בפסיק)</label>
            <input
              className="bt-input"
              value={newTags}
              onChange={e => setNewTags(e.target.value)}
              placeholder="energy, charger, parking"
            />
          </div>
        </div>

        <div className="bt-prompt-footer">
          <span className="bt-hint">
            {items.length} פריטי ידע פעילים בבסיס הנתונים
          </span>
          <button
            className="bt-save-btn"
            onClick={handleAdd}
            disabled={adding || !newTitle.trim() || !newContent.trim()}
          >
            {adding ? 'מוסיף...' : 'הוסף לבסיס הידע'}
          </button>
        </div>
      </div>

      {/* Knowledge items list */}
      <div className="bt-section">
        <h2 className="bt-section-title">פריטי ידע קיימים ({items.length})</h2>

        {items.length === 0 ? (
          <div className="bt-empty">אין עדיין פריטי ידע. הוסף את הראשון למעלה!</div>
        ) : (
          <div className="bt-knowledge-list">
            {items.map(item => (
              <div key={item.id} className="bt-knowledge-card">
                <div
                  className="bt-knowledge-header"
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  <div className="bt-knowledge-title">{item.title}</div>
                  <div className="bt-knowledge-meta">
                    <span className="bt-badge bt-badge-type">{TYPE_LABELS[item.type] || item.type}</span>
                    <span className="bt-knowledge-date">{formatDate(item.created_at)}</span>
                  </div>
                </div>
                {expandedId === item.id && (
                  <div className="bt-knowledge-body">
                    <div className="bt-knowledge-content">{item.content}</div>
                    {item.tags && item.tags.length > 0 && (
                      <div className="bt-knowledge-tags">
                        {item.tags.map((tag, i) => tag && (
                          <span key={i} className="bt-field-chip">{tag}</span>
                        ))}
                      </div>
                    )}
                    <button className="bt-delete-btn" onClick={() => handleDelete(item.id)}>
                      מחק פריט
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}


/* ── Prompt Editor Tab ──────────────────────── */

function PromptEditor() {
  const [prompt, setPrompt] = useState(null)
  const [content, setContent] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchActivePrompt()
  }, [])

  async function fetchActivePrompt() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/bot-prompts/active`)
      const data = await res.json()
      if (data.ok && data.prompt) {
        setPrompt(data.prompt)
        setContent(data.prompt.content || '')
        setName(data.prompt.name || '')
      } else {
        setError('לא נמצא prompt פעיל')
      }
    } catch (e) {
      setError('שגיאה בטעינת prompt: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!prompt) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`${API_BASE}/api/bot-prompts/${prompt.prompt_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prompt, content, name }),
      })
      const data = await res.json()
      if (data.ok) {
        setSuccess('Prompt נשמר בהצלחה! השינויים ייכנסו לתוקף תוך 5 דקות.')
        setTimeout(() => setSuccess(null), 5000)
      } else {
        setError(data.error || 'שגיאה בשמירה')
      }
    } catch (e) {
      setError('שגיאה בשמירה: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="bt-loading">טוען prompt...</div>

  return (
    <>
      {error && <div className="bt-error">{error}</div>}
      {success && <div className="bt-success">{success}</div>}

      <div className="bt-section">
        <h2 className="bt-section-title">הגדרות Prompt</h2>

        <div className="bt-info-box">
          <div className="bt-info-box-title">שדות שה-AI מחלץ מכל הודעה:</div>
          <div className="bt-fields-grid">
            {LLM_FIELDS.map(f => (
              <span key={f} className="bt-field-chip">{f}</span>
            ))}
          </div>
        </div>

        <div className="bt-field">
          <label>שם ה-Prompt</label>
          <input
            className="bt-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Service Call Identifier"
          />
        </div>

        <div className="bt-field">
          <label>תוכן ה-Prompt (הוראות ל-AI)</label>
          <textarea
            className="bt-prompt-textarea"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="הזן כאן את ה-System Prompt..."
          />
        </div>

        <div className="bt-prompt-footer">
          <span className="bt-hint">
            שינויים ייכנסו לתוקף תוך 5 דקות (cache) &bull; אם ה-Prompt ריק, המערכת תשתמש בברירת המחדל
          </span>
          <button
            className="bt-save-btn"
            onClick={handleSave}
            disabled={saving || !content.trim()}
          >
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>
      </div>
    </>
  )
}


/* ── Conversation History Tab ──────────────── */

function ConversationHistory() {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchConversations()
  }, [filterStatus])

  async function fetchConversations() {
    setLoading(true)
    setError(null)
    try {
      const params = filterStatus ? `?status=${filterStatus}` : ''
      const res = await fetch(`${API_BASE}/api/conversations${params}`)
      const data = await res.json()
      if (data.ok) {
        setConversations(data.conversations || [])
      } else {
        setError(data.error || 'שגיאה בטעינת שיחות')
      }
    } catch (e) {
      setError('שגיאה בטעינה: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return dateStr
    }
  }

  function formatPhone(phone) {
    if (!phone) return '-'
    if (phone.startsWith('972') && phone.length >= 12) {
      const local = '0' + phone.slice(3)
      return local.slice(0, 3) + '-' + local.slice(3)
    }
    return phone
  }

  if (loading) return <div className="bt-loading">טוען שיחות...</div>

  return (
    <>
      {error && <div className="bt-error">{error}</div>}

      <div className="bt-section">
        <h2 className="bt-section-title">היסטוריית שיחות</h2>

        <div className="bt-filters">
          <label>סינון לפי סטטוס:</label>
          <select
            className="bt-filter-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">הכל</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {conversations.length === 0 ? (
          <div className="bt-empty">אין שיחות להצגה</div>
        ) : (
          <table className="bt-conv-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>טלפון</th>
                <th>לקוח</th>
                <th>סוג תקלה</th>
                <th>דחיפות</th>
                <th>סטטוס</th>
                <th>מושבתת</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map(conv => (
                <Fragment key={conv.id}>
                  <tr
                    className={expandedId === conv.id ? 'bt-row-expanded' : ''}
                    onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                  >
                    <td>{formatDate(conv.created_at)}</td>
                    <td style={{ direction: 'ltr', textAlign: 'right' }}>{formatPhone(conv.phone)}</td>
                    <td>{conv.cdes || conv.name || '-'}</td>
                    <td>{conv.issue_type || '-'}</td>
                    <td>
                      <span className={URGENCY_CLASS[conv.urgency] || ''}>
                        {URGENCY_LABELS[conv.urgency] || conv.urgency || '-'}
                      </span>
                    </td>
                    <td>
                      <span className={`bt-badge ${STATUS_CLASS[conv.status] || ''}`}>
                        {STATUS_LABELS[conv.status] || conv.status || '-'}
                      </span>
                    </td>
                    <td>
                      {conv.is_system_down ? (
                        <span className="bt-system-down">כן</span>
                      ) : '-'}
                    </td>
                  </tr>
                  {expandedId === conv.id && (
                    <tr className="bt-conv-detail">
                      <td colSpan={7}>
                        <ConversationDetail conv={conv} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}


/* ── Conversation Detail (expanded row) ───── */

function ConversationDetail({ conv }) {
  const [notes, setNotes] = useState('')
  const [learning, setLearning] = useState(false)
  const [learnResult, setLearnResult] = useState(null)

  async function handleLearnFromCall() {
    setLearning(true)
    setLearnResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/from-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: conv.id, notes }),
      })
      const data = await res.json()
      if (data.ok) {
        setLearnResult({ ok: true, title: data.title })
        setNotes('')
      } else {
        setLearnResult({ ok: false, error: data.error })
      }
    } catch (e) {
      setLearnResult({ ok: false, error: e.message })
    } finally {
      setLearning(false)
    }
  }

  return (
    <div>
      <div className="bt-detail-grid">
        <div className="bt-detail-item">
          <span className="bt-detail-label">מספר מכשיר:</span>
          <span className="bt-detail-value">{conv.sernum || '-'}</span>
        </div>
        <div className="bt-detail-item">
          <span className="bt-detail-label">מספר לקוח:</span>
          <span className="bt-detail-value">{conv.custname || '-'}</span>
        </div>
        <div className="bt-detail-item">
          <span className="bt-detail-label">סניף:</span>
          <span className="bt-detail-value">{conv.branchname || '-'}</span>
        </div>
        <div className="bt-detail-item">
          <span className="bt-detail-label">איש קשר:</span>
          <span className="bt-detail-value">{conv.contact_name || '-'}</span>
        </div>
        <div className="bt-detail-item">
          <span className="bt-detail-label">מזהה Priority:</span>
          <span className="bt-detail-value">{conv.priority_callno || '-'}</span>
        </div>
        <div className="bt-detail-item">
          <span className="bt-detail-label">נדחף לפריורטי:</span>
          <span className="bt-detail-value">{conv.priority_pushed ? 'כן' : 'לא'}</span>
        </div>
        {conv.description && (
          <div className="bt-detail-item bt-detail-full">
            <span className="bt-detail-label">תיאור:</span>
            <span className="bt-detail-value">{conv.description}</span>
          </div>
        )}
        {conv.summary && (
          <div className="bt-detail-item bt-detail-full">
            <span className="bt-detail-label">תמצית AI:</span>
            <span className="bt-detail-value">{conv.summary}</span>
          </div>
        )}
        {conv.fault_text && (
          <div className="bt-detail-item bt-detail-full">
            <span className="bt-detail-label">טקסט תקלה:</span>
            <span className="bt-detail-value">{conv.fault_text}</span>
          </div>
        )}
      </div>

      {/* Learn from this conversation */}
      <div className="bt-learn-section">
        <div className="bt-learn-title">למד מהשיחה הזאת</div>
        <textarea
          className="bt-learn-textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="מה הבוט צריך ללמוד מהשיחה הזאת? לדוגמה: כשלקוח מתאר שהמטען תקוע, זו תקלת חשמל ברמת דחיפות גבוהה..."
        />
        <div className="bt-learn-footer">
          {learnResult && (
            <span className={learnResult.ok ? 'bt-success-inline' : 'bt-error-inline'}>
              {learnResult.ok ? `נוסף: "${learnResult.title}"` : learnResult.error}
            </span>
          )}
          <button
            className="bt-learn-btn"
            onClick={handleLearnFromCall}
            disabled={learning || !notes.trim()}
          >
            {learning ? 'שומר...' : 'הוסף לבסיס הידע'}
          </button>
        </div>
      </div>
    </div>
  )
}
