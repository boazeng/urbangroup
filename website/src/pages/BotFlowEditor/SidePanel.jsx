// Side panel for editing a selected node's properties

export default function SidePanel({ node, onUpdate, onDelete, onClose }) {
  if (!node) return null

  const { id, type, data } = node

  function set(field, value) {
    onUpdate(id, { ...data, [field]: value })
  }

  function setBtn(bi, field, value) {
    const buttons = [...(data.buttons || [])]
    buttons[bi] = { ...buttons[bi], [field]: value }
    set('buttons', buttons)
  }

  function addButton() {
    const buttons = [...(data.buttons || [])]
    if (buttons.length >= 3) return
    buttons.push({ id: `btn_${Date.now()}`, title: '', next_step: '' })
    set('buttons', buttons)
  }

  function removeButton(bi) {
    const buttons = [...(data.buttons || [])]
    buttons.splice(bi, 1)
    set('buttons', buttons)
  }

  const isStart = type === 'startNode'
  const isStep = type === 'stepNode'
  const isButtons = type === 'buttonsNode'
  const isAction = type === 'actionNode'
  const isDone = type === 'doneNode'

  return (
    <div className="fsp-panel">
      <div className="fsp-header">
        <span className="fsp-title">
          {isStart && '🚀 פתיחת שיחה'}
          {isStep && '✏️ שאלה פתוחה'}
          {isButtons && '🔘 שאלת בחירה'}
          {isAction && '⚡ פעולה אוטומטית'}
          {isDone && '✓ סיום שיחה'}
        </span>
        <button className="fsp-close" onClick={onClose}>✕</button>
      </div>

      <div className="fsp-body">

        {/* ── Start Node ── */}
        {isStart && (
          <>
            <div className="fsp-field">
              <label>שם התסריט</label>
              <input
                className="fsp-input"
                value={data.name || ''}
                onChange={e => set('name', e.target.value)}
                placeholder="לדוגמה: דיווח תקלה"
              />
            </div>
            <div className="fsp-field">
              <label>הודעת פתיחה (לקוח מוכר)</label>
              <textarea
                className="fsp-textarea"
                rows={3}
                value={data.greeting_known || ''}
                onChange={e => set('greeting_known', e.target.value)}
                placeholder="שלום {customer_name}! כאן שירות הלקוחות."
              />
              <span className="fsp-hint">ניתן להשתמש ב-{'{customer_name}'}</span>
            </div>
            <div className="fsp-field">
              <label>הודעת פתיחה (לקוח לא מוכר)</label>
              <textarea
                className="fsp-textarea"
                rows={3}
                value={data.greeting_unknown || ''}
                onChange={e => set('greeting_unknown', e.target.value)}
                placeholder="שלום! כאן שירות הלקוחות."
              />
            </div>
          </>
        )}

        {/* ── Step Node ── */}
        {isStep && (
          <>
            <div className="fsp-field">
              <label>מזהה שלב</label>
              <input className="fsp-input fsp-disabled" value={id} disabled />
            </div>
            <div className="fsp-field">
              <label>טקסט השאלה</label>
              <textarea
                className="fsp-textarea"
                rows={3}
                value={data.text || ''}
                onChange={e => set('text', e.target.value)}
                placeholder="מה תרצה לשאול את הלקוח?"
              />
            </div>
            <div className="fsp-field">
              <label>שמור תשובה בשדה</label>
              <input
                className="fsp-input"
                value={data.save_to || ''}
                onChange={e => set('save_to', e.target.value)}
                placeholder="e.g. description, location, phone"
              />
              <span className="fsp-hint">שם השדה שישמור את תשובת הלקוח</span>
            </div>
            <div className="fsp-hint fsp-connect-hint">
              חבר את הצומת לשלב הבא ע"י גרירת קו מהנקודה התחתונה
            </div>
          </>
        )}

        {/* ── Buttons Node ── */}
        {isButtons && (
          <>
            <div className="fsp-field">
              <label>מזהה שלב</label>
              <input className="fsp-input fsp-disabled" value={id} disabled />
            </div>
            <div className="fsp-field">
              <label>טקסט השאלה</label>
              <textarea
                className="fsp-textarea"
                rows={3}
                value={data.text || ''}
                onChange={e => set('text', e.target.value)}
                placeholder="מה תרצה לשאול?"
              />
            </div>
            <div className="fsp-section-label">כפתורים (עד 3)</div>
            {(data.buttons || []).map((btn, bi) => (
              <div key={bi} className="fsp-btn-row">
                <input
                  className="fsp-input fsp-btn-input"
                  value={btn.title || ''}
                  onChange={e => setBtn(bi, 'title', e.target.value)}
                  placeholder={`כפתור ${bi + 1} (עד 20 תווים)`}
                  maxLength={20}
                />
                <button className="fsp-remove-btn" onClick={() => removeButton(bi)}>✕</button>
              </div>
            ))}
            {(data.buttons || []).length < 3 && (
              <button className="fsp-add-btn" onClick={addButton}>+ הוסף כפתור</button>
            )}
            <div className="fsp-hint fsp-connect-hint">
              גרור קו מכל כפתור לשלב הבא שלו
            </div>
          </>
        )}

        {/* ── Action Node ── */}
        {isAction && (
          <>
            <div className="fsp-field">
              <label>מזהה</label>
              <input className="fsp-input fsp-disabled" value={id} disabled />
            </div>
            <div className="fsp-field">
              <label>סוג פעולה</label>
              <select
                className="fsp-input"
                value={data.action_type || 'check_equipment'}
                onChange={e => set('action_type', e.target.value)}
              >
                <option value="check_equipment">🔍 בדיקת מערכת (לפי מספר מכשיר)</option>
              </select>
            </div>
            <div className="fsp-field">
              <label>שדה לבדיקה</label>
              <input
                className="fsp-input"
                value={data.field || ''}
                onChange={e => set('field', e.target.value)}
                placeholder="device_number"
              />
              <span className="fsp-hint">שם השדה בסשן שמכיל את הערך לבדיקה</span>
            </div>
            <div className="fsp-field">
              <label>תיאור הבדיקה</label>
              <textarea
                className="fsp-textarea"
                rows={2}
                value={data.description || ''}
                onChange={e => set('description', e.target.value)}
                placeholder="לדוגמה: בדוק שמספר המכשיר קיים במערכת Priority"
              />
              <span className="fsp-hint">תיאור חופשי שיעזור להבין מה הבדיקה עושה</span>
            </div>
            <div className="fsp-hint fsp-connect-hint">
              גרור קו מ-<strong>✓ הצלחה</strong> (שמאל) לשלב הבא בהצלחה<br />
              גרור קו מ-<strong>✕ כישלון</strong> (ימין) לשלב החלופי
            </div>
          </>
        )}

        {/* ── Done Node ── */}
        {isDone && (
          <>
            <div className="fsp-field">
              <label>מזהה</label>
              <input className="fsp-input fsp-disabled" value={id} disabled />
            </div>
            <div className="fsp-field">
              <label>הודעת סיום</label>
              <textarea
                className="fsp-textarea"
                rows={3}
                value={data.text || ''}
                onChange={e => set('text', e.target.value)}
                placeholder="תודה! נציג יחזור אליך בהקדם."
              />
            </div>
            <div className="fsp-field">
              <label>פעולה בסיום</label>
              <select
                className="fsp-input"
                value={['save_service_call', 'save_message', 'notify_only', 'escalate'].includes(data.action) ? data.action : '__custom__'}
                onChange={e => {
                  if (e.target.value !== '__custom__') set('action', e.target.value)
                  else set('action', '')
                }}
              >
                <option value="save_service_call">📋 קריאת שירות</option>
                <option value="save_message">💬 שמור הודעה</option>
                <option value="notify_only">📢 הודע בלבד</option>
                <option value="escalate">🚨 הסלמה דחופה</option>
                <option value="__custom__">✏️ מותאם אישית...</option>
              </select>
              {!['save_service_call', 'save_message', 'notify_only', 'escalate'].includes(data.action) && (
                <input
                  className="fsp-input"
                  style={{ marginTop: 6 }}
                  value={data.action || ''}
                  onChange={e => set('action', e.target.value)}
                  placeholder="הכנס קוד פעולה מותאם..."
                />
              )}
              <span className="fsp-hint">הבוט יבצע פעולה זו בסיום השיחה</span>
            </div>
          </>
        )}

      </div>

      {/* Delete button — not for start node */}
      {!isStart && (
        <div className="fsp-footer">
          <button className="fsp-delete-btn" onClick={() => onDelete(id)}>
            🗑️ מחק צומת
          </button>
        </div>
      )}
    </div>
  )
}
