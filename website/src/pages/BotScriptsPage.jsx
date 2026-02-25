import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './BotScriptsPage.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : ''

const STEP_TYPES = [
  { value: 'buttons', label: 'כפתורים' },
  { value: 'text_input', label: 'קלט טקסט' },
]

export default function BotScriptsPage() {
  const [scripts, setScripts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // script being edited
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => { fetchScripts() }, [])

  async function fetchScripts() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/bot-scripts`)
      const data = await res.json()
      if (data.ok) {
        setScripts(data.scripts)
      } else {
        setError(data.error)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function loadScript(scriptId) {
    try {
      const res = await fetch(`${API_BASE}/api/bot-scripts/${scriptId}`)
      const data = await res.json()
      if (data.ok) {
        setEditing(structuredClone(data.script))
        setSaveMsg('')
      }
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveScript() {
    if (!editing) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch(`${API_BASE}/api/bot-scripts/${editing.script_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      const data = await res.json()
      if (data.ok) {
        setSaveMsg('נשמר בהצלחה!')
        fetchScripts()
      } else {
        setSaveMsg(`שגיאה: ${data.error}`)
      }
    } catch (e) {
      setSaveMsg(`שגיאה: ${e.message}`)
    }
    setSaving(false)
  }

  function updateField(path, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      let obj = next
      const parts = path.split('.')
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = value
      return next
    })
  }

  function updateStep(stepIdx, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps[stepIdx][field] = value
      return next
    })
  }

  function updateButton(stepIdx, btnIdx, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps[stepIdx].buttons[btnIdx][field] = value
      return next
    })
  }

  function updateSkipIf(stepIdx, btnIdx, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      const btn = next.steps[stepIdx].buttons[btnIdx]
      if (!btn.skip_if) btn.skip_if = {}
      btn.skip_if[field] = value
      return next
    })
  }

  function updateStepSkipIf(stepIdx, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      if (!next.steps[stepIdx].skip_if) next.steps[stepIdx].skip_if = {}
      next.steps[stepIdx].skip_if[field] = value
      return next
    })
  }

  function removeStepSkipIf(stepIdx) {
    setEditing(prev => {
      const next = structuredClone(prev)
      delete next.steps[stepIdx].skip_if
      return next
    })
  }

  function addStep() {
    setEditing(prev => {
      const next = structuredClone(prev)
      const newId = `STEP_${Date.now()}`
      next.steps.push({
        id: newId,
        type: 'text_input',
        text: '',
        save_to: '',
        next_step: '',
      })
      return next
    })
  }

  function removeStep(stepIdx) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps.splice(stepIdx, 1)
      return next
    })
  }

  function addButton(stepIdx) {
    setEditing(prev => {
      const next = structuredClone(prev)
      if (!next.steps[stepIdx].buttons) next.steps[stepIdx].buttons = []
      next.steps[stepIdx].buttons.push({
        id: `btn_${Date.now()}`,
        title: '',
        next_step: '',
      })
      return next
    })
  }

  function removeButton(stepIdx, btnIdx) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps[stepIdx].buttons.splice(btnIdx, 1)
      return next
    })
  }

  function addDoneAction() {
    setEditing(prev => {
      const next = structuredClone(prev)
      if (!next.done_actions) next.done_actions = {}
      const newId = `DONE_${Date.now()}`
      next.done_actions[newId] = { text: '', action: 'save_message' }
      return next
    })
  }

  function removeDoneAction(doneId) {
    setEditing(prev => {
      const next = structuredClone(prev)
      delete next.done_actions[doneId]
      return next
    })
  }

  function updateDoneAction(doneId, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.done_actions[doneId][field] = value
      return next
    })
  }

  function renameDoneAction(oldId, newId) {
    if (oldId === newId) return
    setEditing(prev => {
      const next = structuredClone(prev)
      next.done_actions[newId] = next.done_actions[oldId]
      delete next.done_actions[oldId]
      return next
    })
  }

  // Get all step IDs + done action IDs for dropdowns
  function getAllTargets() {
    if (!editing) return []
    const stepIds = (editing.steps || []).map(s => s.id)
    const doneIds = Object.keys(editing.done_actions || {})
    return [...stepIds, ...doneIds]
  }

  // ── Render ──────────────────────────────────────────────────

  if (editing) {
    const targets = getAllTargets()
    return (
      <div className="bs-page">
        <div className="container">
          <button className="bs-back-btn" onClick={() => setEditing(null)}>&rarr; חזרה לרשימה</button>

          <div className="bs-editor-header">
            <h1 className="bs-title">עריכת תסריט</h1>
            <button className="bs-save-btn" onClick={saveScript} disabled={saving}>
              {saving ? 'שומר...' : 'שמירה'}
            </button>
          </div>
          {saveMsg && <div className={`bs-save-msg ${saveMsg.includes('שגיאה') ? 'bs-error' : 'bs-success'}`}>{saveMsg}</div>}

          {/* General settings */}
          <section className="bs-section">
            <h2 className="bs-section-title">הגדרות כלליות</h2>
            <div className="bs-field">
              <label>מזהה</label>
              <input value={editing.script_id} disabled className="bs-input bs-disabled" />
            </div>
            <div className="bs-field">
              <label>שם התסריט</label>
              <input value={editing.name || ''} onChange={e => updateField('name', e.target.value)} className="bs-input" />
            </div>
            <div className="bs-field">
              <label>ברכה (לקוח מוכר)</label>
              <input
                value={editing.greeting_known || ''}
                onChange={e => updateField('greeting_known', e.target.value)}
                className="bs-input"
                placeholder="שלום {customer_name}! כאן הבוט..."
              />
              <span className="bs-hint">השתמש ב-{'{customer_name}'} לשם הלקוח</span>
            </div>
            <div className="bs-field">
              <label>ברכה (לקוח לא מוכר)</label>
              <input
                value={editing.greeting_unknown || ''}
                onChange={e => updateField('greeting_unknown', e.target.value)}
                className="bs-input"
                placeholder="שלום! כאן הבוט..."
              />
            </div>
            <div className="bs-field">
              <label>שלב ראשון</label>
              <select value={editing.first_step || ''} onChange={e => updateField('first_step', e.target.value)} className="bs-select">
                <option value="">בחר...</option>
                {targets.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </section>

          {/* Steps */}
          <section className="bs-section">
            <div className="bs-section-header">
              <h2 className="bs-section-title">שלבים ({editing.steps?.length || 0})</h2>
              <button className="bs-add-btn" onClick={addStep}>+ הוסף שלב</button>
            </div>

            {(editing.steps || []).map((step, si) => (
              <div key={si} className="bs-step-card">
                <div className="bs-step-header">
                  <span className="bs-step-num">{si + 1}</span>
                  <input
                    value={step.id}
                    onChange={e => updateStep(si, 'id', e.target.value)}
                    className="bs-input bs-step-id"
                    placeholder="מזהה שלב"
                  />
                  <select value={step.type} onChange={e => updateStep(si, 'type', e.target.value)} className="bs-select bs-step-type">
                    {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button className="bs-remove-btn" onClick={() => removeStep(si)}>✕</button>
                </div>

                {/* Step-level skip_if */}
                <div className="bs-step-skip">
                  {step.skip_if ? (
                    <div className="bs-step-skip-row">
                      <span className="bs-step-skip-label">דלג אוטומטית אם</span>
                      <input
                        value={step.skip_if.field || ''}
                        onChange={e => updateStepSkipIf(si, 'field', e.target.value)}
                        className="bs-input bs-skip-field"
                        placeholder="שדה"
                      />
                      <select
                        value={step.skip_if.not_empty ? 'not_empty' : step.skip_if.empty ? 'empty' : step.skip_if.equals !== undefined ? 'equals' : ''}
                        onChange={e => {
                          const cond = e.target.value
                          const updated = { field: step.skip_if.field || '', goto: step.skip_if.goto || '' }
                          if (cond === 'not_empty') updated.not_empty = true
                          else if (cond === 'empty') updated.empty = true
                          else if (cond === 'equals') { updated.equals = step.skip_if.equals || '' }
                          setEditing(prev => {
                            const next = structuredClone(prev)
                            next.steps[si].skip_if = updated
                            return next
                          })
                        }}
                        className="bs-select bs-skip-cond"
                      >
                        <option value="">תנאי...</option>
                        <option value="not_empty">לא ריק</option>
                        <option value="empty">ריק</option>
                        <option value="equals">שווה ל...</option>
                      </select>
                      {step.skip_if.equals !== undefined && (
                        <input
                          value={step.skip_if.equals || ''}
                          onChange={e => updateStepSkipIf(si, 'equals', e.target.value)}
                          className="bs-input bs-skip-val"
                          placeholder="ערך"
                        />
                      )}
                      <span className="bs-skip-arrow">→</span>
                      <select
                        value={step.skip_if.goto || ''}
                        onChange={e => updateStepSkipIf(si, 'goto', e.target.value)}
                        className="bs-select bs-skip-goto"
                      >
                        <option value="">דלג ל...</option>
                        {targets.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button className="bs-remove-btn bs-small" onClick={() => removeStepSkipIf(si)}>✕</button>
                    </div>
                  ) : (
                    <button
                      className="bs-add-skip-btn"
                      onClick={() => updateStepSkipIf(si, 'field', '')}
                    >
                      + הוסף תנאי דילוג
                    </button>
                  )}
                </div>

                <div className="bs-field">
                  <label>טקסט</label>
                  <textarea
                    value={step.text || ''}
                    onChange={e => updateStep(si, 'text', e.target.value)}
                    className="bs-textarea"
                    rows={2}
                  />
                </div>

                {step.type === 'text_input' && (
                  <div className="bs-row">
                    <div className="bs-field bs-half">
                      <label>שמור בשדה</label>
                      <input
                        value={step.save_to || ''}
                        onChange={e => updateStep(si, 'save_to', e.target.value)}
                        className="bs-input"
                        placeholder="e.g. description"
                      />
                    </div>
                    <div className="bs-field bs-half">
                      <label>שלב הבא</label>
                      <select value={step.next_step || ''} onChange={e => updateStep(si, 'next_step', e.target.value)} className="bs-select">
                        <option value="">בחר...</option>
                        {targets.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {step.type === 'buttons' && (
                  <div className="bs-buttons-section">
                    <div className="bs-buttons-header">
                      <span className="bs-label">כפתורים</span>
                      {(step.buttons || []).length < 3 && (
                        <button className="bs-add-btn bs-small" onClick={() => addButton(si)}>+ כפתור</button>
                      )}
                    </div>
                    {(step.buttons || []).map((btn, bi) => (
                      <div key={bi} className="bs-button-row">
                        <input
                          value={btn.id}
                          onChange={e => updateButton(si, bi, 'id', e.target.value)}
                          className="bs-input bs-btn-id"
                          placeholder="מזהה"
                        />
                        <input
                          value={btn.title}
                          onChange={e => updateButton(si, bi, 'title', e.target.value)}
                          className="bs-input bs-btn-title"
                          placeholder="כותרת (עד 20 תווים)"
                          maxLength={20}
                        />
                        <select
                          value={btn.next_step || ''}
                          onChange={e => updateButton(si, bi, 'next_step', e.target.value)}
                          className="bs-select bs-btn-next"
                        >
                          <option value="">שלב הבא...</option>
                          {targets.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button className="bs-remove-btn bs-small" onClick={() => removeButton(si, bi)}>✕</button>
                        {/* Skip-if */}
                        <div className="bs-skip-if">
                          <label className="bs-skip-label">דלג אם:</label>
                          <input
                            value={btn.skip_if?.field || ''}
                            onChange={e => updateSkipIf(si, bi, 'field', e.target.value)}
                            className="bs-input bs-skip-field"
                            placeholder="שדה"
                          />
                          <span className="bs-skip-arrow">→</span>
                          <select
                            value={btn.skip_if?.goto || ''}
                            onChange={e => updateSkipIf(si, bi, 'goto', e.target.value)}
                            className="bs-select bs-skip-goto"
                          >
                            <option value="">דלג ל...</option>
                            {targets.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Done Actions */}
          <section className="bs-section">
            <div className="bs-section-header">
              <h2 className="bs-section-title">פעולות סיום</h2>
              <button className="bs-add-btn" onClick={addDoneAction}>+ הוסף פעולה</button>
            </div>

            {Object.entries(editing.done_actions || {}).map(([doneId, cfg]) => (
              <div key={doneId} className="bs-done-card">
                <div className="bs-done-header">
                  <input
                    value={doneId}
                    onChange={e => renameDoneAction(doneId, e.target.value)}
                    className="bs-input bs-done-id"
                    placeholder="מזהה (e.g. DONE_FAULT)"
                  />
                  <select
                    value={cfg.action || ''}
                    onChange={e => updateDoneAction(doneId, 'action', e.target.value)}
                    className="bs-select"
                  >
                    <option value="save_message">שמור הודעה</option>
                    <option value="save_service_call">פתח קריאת שירות</option>
                  </select>
                  <button className="bs-remove-btn" onClick={() => removeDoneAction(doneId)}>✕</button>
                </div>
                <div className="bs-field">
                  <label>הודעת סיום</label>
                  <textarea
                    value={cfg.text || ''}
                    onChange={e => updateDoneAction(doneId, 'text', e.target.value)}
                    className="bs-textarea"
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </section>

          <div className="bs-bottom-bar">
            <button className="bs-save-btn" onClick={saveScript} disabled={saving}>
              {saving ? 'שומר...' : 'שמירה'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Script List ──────────────────────────────────────────────

  return (
    <div className="bs-page">
      <div className="container">
        <Link to="/maintenance" className="bs-back">&rarr; חזרה לאחזקה</Link>

        <div className="bs-header">
          <h1 className="bs-title">תסריטי בוט</h1>
        </div>

        {loading && <div className="bs-loading">טוען...</div>}
        {error && <div className="bs-error">{error}</div>}

        <div className="bs-list">
          {scripts.map(s => (
            <div key={s.script_id} className="bs-card" onClick={() => loadScript(s.script_id)}>
              <div className="bs-card-info">
                <h3 className="bs-card-name">{s.name || s.script_id}</h3>
                <span className="bs-card-id">{s.script_id}</span>
                <span className="bs-card-meta">{(s.steps || []).length} שלבים</span>
              </div>
              <span className={`bs-card-badge ${s.active ? 'bs-active' : 'bs-inactive'}`}>
                {s.active ? 'פעיל' : 'לא פעיל'}
              </span>
            </div>
          ))}
          {!loading && scripts.length === 0 && (
            <div className="bs-empty">אין תסריטים עדיין</div>
          )}
        </div>
      </div>
    </div>
  )
}
