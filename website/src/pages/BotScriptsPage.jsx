import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './BotScriptsPage.css'

// In dev, Vite proxy routes /api → localhost:5001
const API_BASE = ''

// ── Conversion: simple ↔ script format ───────────────────────

function simpleToScript(simple, scriptId) {
  const stepIds = simple.steps.map((_, i) => `STEP_${i + 1}`)

  const steps = simple.steps.map((step, i) => {
    const nextTarget = i < simple.steps.length - 1 ? stepIds[i + 1] : 'DONE_1'

    if (step.type === 'text_input') {
      return {
        id: stepIds[i],
        type: 'text_input',
        text: step.text,
        save_to: `field_${i + 1}`,
        next_step: nextTarget,
      }
    } else {
      const validButtons = step.buttons.filter(b => b.trim())
      return {
        id: stepIds[i],
        type: 'buttons',
        text: step.text,
        buttons: validButtons.map((title, bi) => ({
          id: `btn_${i + 1}_${bi + 1}`,
          title: title.slice(0, 20),
          next_step: nextTarget,
        })),
      }
    }
  })

  return {
    script_id: scriptId,
    name: simple.name,
    greeting_known: simple.greeting,
    greeting_unknown: simple.greeting,
    first_step: steps.length > 0 ? stepIds[0] : 'DONE_1',
    steps,
    done_actions: {
      DONE_1: {
        text: simple.done_text,
        action: simple.done_action,
      },
    },
    active: true,
  }
}

function scriptToSimple(script) {
  const steps = (script.steps || []).map(step => {
    if (step.type === 'buttons') {
      const btns = (step.buttons || []).map(b => b.title || '')
      while (btns.length < 3) btns.push('')
      return { text: step.text || '', type: 'buttons', buttons: btns.slice(0, 3) }
    }
    return { text: step.text || '', type: 'text_input', buttons: ['', '', ''] }
  })

  const firstDone = Object.values(script.done_actions || {})[0] || {}

  return {
    name: script.name || '',
    greeting: script.greeting_known || script.greeting_unknown || '',
    steps,
    done_text: firstDone.text || '',
    done_action: firstDone.action || 'save_service_call',
  }
}

function emptySimple() {
  return {
    name: '',
    greeting: '',
    steps: [{ text: '', type: 'text_input', buttons: ['', '', ''] }],
    done_text: '',
    done_action: 'save_service_call',
  }
}

// ── Main Component ────────────────────────────────────────────

export default function BotScriptsPage() {
  const [view, setView] = useState('list') // 'list' | 'simple' | 'advanced'
  const [scripts, setScripts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Simple editor state
  const [simple, setSimple] = useState(emptySimple())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Advanced editor state
  const [editing, setEditing] = useState(null)

  // AI generate state
  const [aiDesc, setAiDesc] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [showAi, setShowAi] = useState(false)

  useEffect(() => { fetchScripts() }, [])

  async function fetchScripts() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/bot-scripts`)
      const data = await res.json()
      if (data.ok) setScripts(data.scripts)
      else setError(data.error)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  function openNew() {
    setEditingId(`script_${Date.now()}`)
    setSimple(emptySimple())
    setSaveMsg('')
    setShowAi(false)
    setAiDesc('')
    setView('simple')
  }

  async function openEdit(scriptId) {
    try {
      const res = await fetch(`${API_BASE}/api/bot-scripts/${scriptId}`)
      const data = await res.json()
      if (data.ok) {
        setEditingId(scriptId)
        setSimple(scriptToSimple(data.script))
        setEditing(structuredClone(data.script))
        setSaveMsg('')
        setShowAi(false)
        setView('simple')
      }
    } catch (e) { setError(e.message) }
  }

  async function saveSimple() {
    if (!simple.name.trim()) { setSaveMsg('שגיאה: נדרש שם תסריט'); return }
    setSaving(true)
    setSaveMsg('')
    const script = simpleToScript(simple, editingId)
    try {
      const existing = scripts.find(s => s.script_id === editingId)
      const method = existing ? 'PUT' : 'POST'
      const url = existing
        ? `${API_BASE}/api/bot-scripts/${editingId}`
        : `${API_BASE}/api/bot-scripts`
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(script),
      })
      const data = await res.json()
      if (data.ok) {
        setSaveMsg('נשמר בהצלחה!')
        fetchScripts()
      } else {
        setSaveMsg(`שגיאה: ${data.error}`)
      }
    } catch (e) { setSaveMsg(`שגיאה: ${e.message}`) }
    setSaving(false)
  }

  async function generateWithAI() {
    if (!aiDesc.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch(`${API_BASE}/api/bot-scripts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiDesc }),
      })
      const data = await res.json()
      if (data.ok && data.script) {
        setSimple(scriptToSimple(data.script))
        setShowAi(false)
        setAiDesc('')
      } else {
        setAiError(data.error || 'שגיאה ביצירת התסריט')
      }
    } catch (e) { setAiError(e.message) }
    setAiLoading(false)
  }

  // ── Simple editor helpers ─────────────────────────────────

  function updateField(field, value) {
    setSimple(prev => ({ ...prev, [field]: value }))
  }

  function updateStep(i, field, value) {
    setSimple(prev => {
      const steps = [...prev.steps]
      steps[i] = { ...steps[i], [field]: value }
      if (field === 'type' && value === 'buttons' && !steps[i].buttons?.length) {
        steps[i].buttons = ['', '', '']
      }
      return { ...prev, steps }
    })
  }

  function updateButton(stepIdx, btnIdx, value) {
    setSimple(prev => {
      const steps = [...prev.steps]
      const buttons = [...(steps[stepIdx].buttons || ['', '', ''])]
      buttons[btnIdx] = value
      steps[stepIdx] = { ...steps[stepIdx], buttons }
      return { ...prev, steps }
    })
  }

  function addStep() {
    setSimple(prev => ({
      ...prev,
      steps: [...prev.steps, { text: '', type: 'text_input', buttons: ['', '', ''] }],
    }))
  }

  function removeStep(i) {
    setSimple(prev => {
      const steps = [...prev.steps]
      steps.splice(i, 1)
      return { ...prev, steps }
    })
  }

  function moveStep(i, dir) {
    setSimple(prev => {
      const steps = [...prev.steps]
      const j = i + dir
      if (j < 0 || j >= steps.length) return prev
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...prev, steps }
    })
  }

  // ── Advanced editor helpers ───────────────────────────────

  function advUpdateField(path, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      let obj = next
      const parts = path.split('.')
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]]
      obj[parts[parts.length - 1]] = value
      return next
    })
  }

  function advUpdateStep(si, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps[si][field] = value
      return next
    })
  }

  function advUpdateButton(si, bi, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps[si].buttons[bi][field] = value
      return next
    })
  }

  function advUpdateSkipIf(si, bi, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      const btn = next.steps[si].buttons[bi]
      if (!btn.skip_if) btn.skip_if = {}
      btn.skip_if[field] = value
      return next
    })
  }

  function advUpdateStepSkipIf(si, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      if (!next.steps[si].skip_if) next.steps[si].skip_if = {}
      next.steps[si].skip_if[field] = value
      return next
    })
  }

  function advRemoveStepSkipIf(si) {
    setEditing(prev => {
      const next = structuredClone(prev)
      delete next.steps[si].skip_if
      return next
    })
  }

  function advAddStep() {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps.push({ id: `STEP_${Date.now()}`, type: 'text_input', text: '', save_to: '', next_step: '' })
      return next
    })
  }

  function advRemoveStep(si) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps.splice(si, 1)
      return next
    })
  }

  function advAddButton(si) {
    setEditing(prev => {
      const next = structuredClone(prev)
      if (!next.steps[si].buttons) next.steps[si].buttons = []
      next.steps[si].buttons.push({ id: `btn_${Date.now()}`, title: '', next_step: '' })
      return next
    })
  }

  function advRemoveButton(si, bi) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.steps[si].buttons.splice(bi, 1)
      return next
    })
  }

  function advAddDoneAction() {
    setEditing(prev => {
      const next = structuredClone(prev)
      if (!next.done_actions) next.done_actions = {}
      next.done_actions[`DONE_${Date.now()}`] = { text: '', action: 'save_message' }
      return next
    })
  }

  function advRemoveDoneAction(id) {
    setEditing(prev => {
      const next = structuredClone(prev)
      delete next.done_actions[id]
      return next
    })
  }

  function advUpdateDoneAction(id, field, value) {
    setEditing(prev => {
      const next = structuredClone(prev)
      next.done_actions[id][field] = value
      return next
    })
  }

  function advRenameDoneAction(oldId, newId) {
    if (oldId === newId) return
    setEditing(prev => {
      const next = structuredClone(prev)
      next.done_actions[newId] = next.done_actions[oldId]
      delete next.done_actions[oldId]
      return next
    })
  }

  function advGetAllTargets() {
    if (!editing) return []
    return [
      ...(editing.steps || []).map(s => s.id),
      ...Object.keys(editing.done_actions || {}),
    ]
  }

  async function saveAdvanced() {
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
    } catch (e) { setSaveMsg(`שגיאה: ${e.message}`) }
    setSaving(false)
  }

  // ── RENDER: Simple Editor ─────────────────────────────────

  if (view === 'simple') {
    const isExisting = scripts.some(s => s.script_id === editingId)

    return (
      <div className="bs-page">
        <div className="container">
          <button className="bs-back-btn" onClick={() => setView('list')}>→ חזרה לרשימה</button>

          <div className="bs-editor-header">
            <h1 className="bs-title">{isExisting ? 'עריכת תסריט' : 'תסריט חדש'}</h1>
            <div className="bs-header-actions">
              <button
                className="bs-advanced-link"
                onClick={() => { setEditing(simpleToScript(simple, editingId)); setView('advanced') }}
              >
                מצב מתקדם ›
              </button>
              <button className="bs-save-btn" onClick={saveSimple} disabled={saving}>
                {saving ? 'שומר...' : 'שמירה'}
              </button>
            </div>
          </div>

          {saveMsg && (
            <div className={`bs-save-msg ${saveMsg.includes('שגיאה') ? 'bs-error' : 'bs-success'}`}>
              {saveMsg}
            </div>
          )}

          {/* AI Generate */}
          <div className="bs-ai-section">
            <button className="bs-ai-toggle" onClick={() => { setShowAi(!showAi); setAiError('') }}>
              {showAi ? '✕ סגור' : '✨ צור תסריט עם AI'}
            </button>
            {showAi && (
              <div className="bs-ai-box">
                <p className="bs-ai-hint">תאר בעברית את השיחה שאתה רוצה שהבוט יקיים עם הלקוח</p>
                <textarea
                  className="bs-textarea bs-ai-textarea"
                  rows={4}
                  placeholder="לדוגמה: הבוט צריך לשאול תיאור תקלה, אחר כך לשאול איפה במבנה זה קרה, ולסוף לשאול אם זה דחוף. בסוף לפתוח קריאת שירות."
                  value={aiDesc}
                  onChange={e => setAiDesc(e.target.value)}
                />
                {aiError && <div className="bs-error">{aiError}</div>}
                <button
                  className="bs-ai-btn"
                  onClick={generateWithAI}
                  disabled={aiLoading || !aiDesc.trim()}
                >
                  {aiLoading ? '⏳ מייצר תסריט...' : '✨ צור תסריט'}
                </button>
              </div>
            )}
          </div>

          {/* Script info */}
          <section className="bs-section">
            <div className="bs-field">
              <label>שם התסריט</label>
              <input
                className="bs-input"
                value={simple.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="לדוגמה: דיווח תקלה"
              />
            </div>
            <div className="bs-field">
              <label>הודעת פתיחה</label>
              <textarea
                className="bs-textarea"
                rows={2}
                value={simple.greeting}
                onChange={e => updateField('greeting', e.target.value)}
                placeholder={'שלום {customer_name}! כאן שירות הלקוחות. כיצד נוכל לעזור?'}
              />
              <span className="bs-hint">ניתן להשתמש ב-{'{customer_name}'} לשם הלקוח</span>
            </div>
          </section>

          {/* Steps */}
          <section className="bs-section">
            <div className="bs-section-header">
              <h2 className="bs-section-title">שאלות ({simple.steps.length})</h2>
            </div>

            {simple.steps.map((step, i) => (
              <div key={i} className="bs-simple-step">
                <div className="bs-simple-step-header">
                  <span className="bs-step-num">{i + 1}</span>

                  <div className="bs-type-toggle">
                    <button
                      className={`bs-type-btn${step.type === 'text_input' ? ' active' : ''}`}
                      onClick={() => updateStep(i, 'type', 'text_input')}
                    >
                      ✏️ טקסט חופשי
                    </button>
                    <button
                      className={`bs-type-btn${step.type === 'buttons' ? ' active' : ''}`}
                      onClick={() => updateStep(i, 'type', 'buttons')}
                    >
                      🔘 כפתורים
                    </button>
                  </div>

                  <div className="bs-step-controls">
                    {i > 0 && (
                      <button className="bs-move-btn" onClick={() => moveStep(i, -1)} title="הזז למעלה">↑</button>
                    )}
                    {i < simple.steps.length - 1 && (
                      <button className="bs-move-btn" onClick={() => moveStep(i, 1)} title="הזז למטה">↓</button>
                    )}
                    {simple.steps.length > 1 && (
                      <button className="bs-remove-btn bs-small" onClick={() => removeStep(i)}>✕</button>
                    )}
                  </div>
                </div>

                <textarea
                  className="bs-textarea bs-simple-question"
                  rows={2}
                  placeholder="מה תרצה לשאול את הלקוח?"
                  value={step.text}
                  onChange={e => updateStep(i, 'text', e.target.value)}
                />

                {step.type === 'buttons' && (
                  <div className="bs-simple-buttons">
                    {[0, 1, 2].map(bi => {
                      const showBtn = bi === 0 || (step.buttons[bi - 1] || '').trim()
                      if (!showBtn && !(step.buttons[bi] || '').trim()) return null
                      return (
                        <input
                          key={bi}
                          className="bs-input bs-btn-chip-input"
                          placeholder={`כפתור ${bi + 1}`}
                          value={step.buttons[bi] || ''}
                          onChange={e => updateButton(i, bi, e.target.value)}
                          maxLength={20}
                        />
                      )
                    })}
                  </div>
                )}

                {i < simple.steps.length - 1 && (
                  <div className="bs-step-connector">↓</div>
                )}
              </div>
            ))}

            <button className="bs-add-step-btn" onClick={addStep}>
              + הוסף שאלה
            </button>
          </section>

          {/* Done */}
          <section className="bs-section bs-done-section">
            <h2 className="bs-section-title">✓ סיום שיחה</h2>
            <div className="bs-field">
              <label>הודעת סיום</label>
              <textarea
                className="bs-textarea"
                rows={2}
                value={simple.done_text}
                onChange={e => updateField('done_text', e.target.value)}
                placeholder="תודה! נציג יחזור אליך בהקדם."
              />
            </div>
            <div className="bs-field">
              <label>פעולה בסיום</label>
              <div className="bs-type-toggle">
                <button
                  className={`bs-type-btn${simple.done_action === 'save_service_call' ? ' active' : ''}`}
                  onClick={() => updateField('done_action', 'save_service_call')}
                >
                  📋 פתח קריאת שירות
                </button>
                <button
                  className={`bs-type-btn${simple.done_action === 'save_message' ? ' active' : ''}`}
                  onClick={() => updateField('done_action', 'save_message')}
                >
                  💬 שמור הודעה בלבד
                </button>
              </div>
            </div>
          </section>

          <div className="bs-bottom-bar">
            <button className="bs-save-btn" onClick={saveSimple} disabled={saving}>
              {saving ? 'שומר...' : 'שמירה'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: Advanced Editor ───────────────────────────────

  if (view === 'advanced' && editing) {
    const targets = advGetAllTargets()
    const STEP_TYPES = [
      { value: 'buttons', label: 'כפתורים' },
      { value: 'text_input', label: 'קלט טקסט' },
    ]

    return (
      <div className="bs-page">
        <div className="container">
          <button className="bs-back-btn" onClick={() => setView('list')}>→ חזרה לרשימה</button>

          <div className="bs-editor-header">
            <div>
              <h1 className="bs-title">מצב מתקדם</h1>
              <button className="bs-advanced-link bs-back-simple" onClick={() => setView('simple')}>
                ← חזרה למצב פשוט
              </button>
            </div>
            <button className="bs-save-btn" onClick={saveAdvanced} disabled={saving}>
              {saving ? 'שומר...' : 'שמירה'}
            </button>
          </div>

          {saveMsg && (
            <div className={`bs-save-msg ${saveMsg.includes('שגיאה') ? 'bs-error' : 'bs-success'}`}>
              {saveMsg}
            </div>
          )}

          <section className="bs-section">
            <h2 className="bs-section-title">הגדרות כלליות</h2>
            <div className="bs-field">
              <label>מזהה</label>
              <input value={editing.script_id} disabled className="bs-input bs-disabled" />
            </div>
            <div className="bs-field">
              <label>שם התסריט</label>
              <input value={editing.name || ''} onChange={e => advUpdateField('name', e.target.value)} className="bs-input" />
            </div>
            <div className="bs-field">
              <label>ברכה (לקוח מוכר)</label>
              <input value={editing.greeting_known || ''} onChange={e => advUpdateField('greeting_known', e.target.value)} className="bs-input" placeholder="שלום {customer_name}!" />
              <span className="bs-hint">השתמש ב-{'{customer_name}'} לשם הלקוח</span>
            </div>
            <div className="bs-field">
              <label>ברכה (לקוח לא מוכר)</label>
              <input value={editing.greeting_unknown || ''} onChange={e => advUpdateField('greeting_unknown', e.target.value)} className="bs-input" />
            </div>
            <div className="bs-field">
              <label>שלב ראשון</label>
              <select value={editing.first_step || ''} onChange={e => advUpdateField('first_step', e.target.value)} className="bs-select">
                <option value="">בחר...</option>
                {targets.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </section>

          <section className="bs-section">
            <div className="bs-section-header">
              <h2 className="bs-section-title">שלבים ({editing.steps?.length || 0})</h2>
              <button className="bs-add-btn" onClick={advAddStep}>+ הוסף שלב</button>
            </div>

            {(editing.steps || []).map((step, si) => (
              <div key={si} className="bs-step-card">
                <div className="bs-step-header">
                  <span className="bs-step-num">{si + 1}</span>
                  <input value={step.id} onChange={e => advUpdateStep(si, 'id', e.target.value)} className="bs-input bs-step-id" placeholder="מזהה שלב" />
                  <select value={step.type} onChange={e => advUpdateStep(si, 'type', e.target.value)} className="bs-select bs-step-type">
                    {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button className="bs-remove-btn" onClick={() => advRemoveStep(si)}>✕</button>
                </div>

                <div className="bs-step-skip">
                  {step.skip_if ? (
                    <div className="bs-step-skip-row">
                      <span className="bs-step-skip-label">דלג אוטומטית אם</span>
                      <input value={step.skip_if.field || ''} onChange={e => advUpdateStepSkipIf(si, 'field', e.target.value)} className="bs-input bs-skip-field" placeholder="שדה" />
                      <select
                        value={step.skip_if.not_empty ? 'not_empty' : step.skip_if.empty ? 'empty' : step.skip_if.equals !== undefined ? 'equals' : ''}
                        onChange={e => {
                          const cond = e.target.value
                          const updated = { field: step.skip_if.field || '', goto: step.skip_if.goto || '' }
                          if (cond === 'not_empty') updated.not_empty = true
                          else if (cond === 'empty') updated.empty = true
                          else if (cond === 'equals') updated.equals = step.skip_if.equals || ''
                          setEditing(prev => { const next = structuredClone(prev); next.steps[si].skip_if = updated; return next })
                        }}
                        className="bs-select bs-skip-cond"
                      >
                        <option value="">תנאי...</option>
                        <option value="not_empty">לא ריק</option>
                        <option value="empty">ריק</option>
                        <option value="equals">שווה ל...</option>
                      </select>
                      {step.skip_if.equals !== undefined && (
                        <input value={step.skip_if.equals || ''} onChange={e => advUpdateStepSkipIf(si, 'equals', e.target.value)} className="bs-input bs-skip-val" placeholder="ערך" />
                      )}
                      <span className="bs-skip-arrow">→</span>
                      <select value={step.skip_if.goto || ''} onChange={e => advUpdateStepSkipIf(si, 'goto', e.target.value)} className="bs-select bs-skip-goto">
                        <option value="">דלג ל...</option>
                        {targets.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button className="bs-remove-btn bs-small" onClick={() => advRemoveStepSkipIf(si)}>✕</button>
                    </div>
                  ) : (
                    <button className="bs-add-skip-btn" onClick={() => advUpdateStepSkipIf(si, 'field', '')}>+ הוסף תנאי דילוג</button>
                  )}
                </div>

                <div className="bs-field">
                  <label>טקסט</label>
                  <textarea value={step.text || ''} onChange={e => advUpdateStep(si, 'text', e.target.value)} className="bs-textarea" rows={2} />
                </div>

                {step.type === 'text_input' && (
                  <div className="bs-row">
                    <div className="bs-field bs-half">
                      <label>שמור בשדה</label>
                      <input value={step.save_to || ''} onChange={e => advUpdateStep(si, 'save_to', e.target.value)} className="bs-input" placeholder="e.g. description" />
                    </div>
                    <div className="bs-field bs-half">
                      <label>שלב הבא</label>
                      <select value={step.next_step || ''} onChange={e => advUpdateStep(si, 'next_step', e.target.value)} className="bs-select">
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
                        <button className="bs-add-btn bs-small" onClick={() => advAddButton(si)}>+ כפתור</button>
                      )}
                    </div>
                    {(step.buttons || []).map((btn, bi) => (
                      <div key={bi} className="bs-button-row">
                        <input value={btn.id} onChange={e => advUpdateButton(si, bi, 'id', e.target.value)} className="bs-input bs-btn-id" placeholder="מזהה" />
                        <input value={btn.title} onChange={e => advUpdateButton(si, bi, 'title', e.target.value)} className="bs-input bs-btn-title" placeholder="כותרת (עד 20 תווים)" maxLength={20} />
                        <select value={btn.next_step || ''} onChange={e => advUpdateButton(si, bi, 'next_step', e.target.value)} className="bs-select bs-btn-next">
                          <option value="">שלב הבא...</option>
                          {targets.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button className="bs-remove-btn bs-small" onClick={() => advRemoveButton(si, bi)}>✕</button>
                        <div className="bs-skip-if">
                          <label className="bs-skip-label">דלג אם:</label>
                          <input value={btn.skip_if?.field || ''} onChange={e => advUpdateSkipIf(si, bi, 'field', e.target.value)} className="bs-input bs-skip-field" placeholder="שדה" />
                          <span className="bs-skip-arrow">→</span>
                          <select value={btn.skip_if?.goto || ''} onChange={e => advUpdateSkipIf(si, bi, 'goto', e.target.value)} className="bs-select bs-skip-goto">
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

          <section className="bs-section">
            <div className="bs-section-header">
              <h2 className="bs-section-title">פעולות סיום</h2>
              <button className="bs-add-btn" onClick={advAddDoneAction}>+ הוסף פעולה</button>
            </div>
            {Object.entries(editing.done_actions || {}).map(([doneId, cfg]) => (
              <div key={doneId} className="bs-done-card">
                <div className="bs-done-header">
                  <input value={doneId} onChange={e => advRenameDoneAction(doneId, e.target.value)} className="bs-input bs-done-id" placeholder="מזהה" />
                  <select value={cfg.action || ''} onChange={e => advUpdateDoneAction(doneId, 'action', e.target.value)} className="bs-select">
                    <option value="save_message">שמור הודעה</option>
                    <option value="save_service_call">פתח קריאת שירות</option>
                  </select>
                  <button className="bs-remove-btn" onClick={() => advRemoveDoneAction(doneId)}>✕</button>
                </div>
                <div className="bs-field">
                  <label>הודעת סיום</label>
                  <textarea value={cfg.text || ''} onChange={e => advUpdateDoneAction(doneId, 'text', e.target.value)} className="bs-textarea" rows={2} />
                </div>
              </div>
            ))}
          </section>

          <div className="bs-bottom-bar">
            <button className="bs-save-btn" onClick={saveAdvanced} disabled={saving}>
              {saving ? 'שומר...' : 'שמירה'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: List ──────────────────────────────────────────

  return (
    <div className="bs-page">
      <div className="container">
        <Link to="/maintenance" className="bs-back">→ חזרה לאחזקה</Link>

        <div className="bs-header">
          <h1 className="bs-title">תסריטי בוט</h1>
          <button className="bs-save-btn" onClick={openNew}>+ תסריט חדש</button>
        </div>

        {loading && <div className="bs-loading">טוען...</div>}
        {error && <div className="bs-error">{error}</div>}

        <div className="bs-list">
          {scripts.map(s => (
            <div key={s.script_id} className="bs-card" onClick={() => openEdit(s.script_id)}>
              <div className="bs-card-info">
                <h3 className="bs-card-name">{s.name || s.script_id}</h3>
                <span className="bs-card-id">{s.script_id}</span>
                <span className="bs-card-meta">{(s.steps || []).length} שאלות</span>
              </div>
              <span className={`bs-card-badge ${s.active ? 'bs-active' : 'bs-inactive'}`}>
                {s.active ? 'פעיל' : 'לא פעיל'}
              </span>
            </div>
          ))}
          {!loading && scripts.length === 0 && (
            <div className="bs-empty">
              <p>אין תסריטים עדיין</p>
              <button className="bs-add-btn" onClick={openNew} style={{ marginTop: 12 }}>
                + צור תסריט ראשון
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
