import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

// ── Start Node ────────────────────────────────────────────────

export const StartNode = memo(({ data, selected }) => (
  <div className={`fn-node fn-start${selected ? ' fn-selected' : ''}`}>
    <div className="fn-start-icon">🚀</div>
    <div className="fn-start-title">פתיחת שיחה</div>
    {data.name && <div className="fn-name-badge">{data.name}</div>}
    <div className="fn-text">
      {data.greeting_known || <span className="fn-placeholder">הגדר הודעת פתיחה...</span>}
    </div>
    <Handle type="source" position={Position.Bottom} className="fn-handle fn-handle-out" />
  </div>
))
StartNode.displayName = 'StartNode'

// ── Step Node (text input) ────────────────────────────────────

export const StepNode = memo(({ data, selected }) => (
  <div className={`fn-node fn-step${selected ? ' fn-selected' : ''}`}>
    <Handle type="target" position={Position.Top} className="fn-handle fn-handle-in" />
    <div className="fn-badge fn-badge-text">✏️ שאלה פתוחה</div>
    <div className="fn-node-id">{data.id}</div>
    <div className="fn-text">
      {data.text || <span className="fn-placeholder">הגדר שאלה...</span>}
    </div>
    {data.save_to && (
      <div className="fn-meta">שומר ב: <code>{data.save_to}</code></div>
    )}
    <Handle type="source" position={Position.Bottom} className="fn-handle fn-handle-out" />
  </div>
))
StepNode.displayName = 'StepNode'

// ── Buttons Node ──────────────────────────────────────────────

export const ButtonsNode = memo(({ data, selected }) => {
  const buttons = data.buttons || []
  return (
    <div className={`fn-node fn-buttons${selected ? ' fn-selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="fn-handle fn-handle-in" />
      <div className="fn-badge fn-badge-btns">🔘 בחירה</div>
      <div className="fn-node-id">{data.id}</div>
      <div className="fn-text">
        {data.text || <span className="fn-placeholder">הגדר שאלה...</span>}
      </div>
      <div className="fn-buttons-list">
        {buttons.map((btn, i) => (
          <div key={i} className="fn-btn-chip">
            <span>{btn.title || `כפתור ${i + 1}`}</span>
          </div>
        ))}
      </div>
      {/* Handles placed at node root, distributed at bottom — NOT inside chips */}
      {buttons.map((btn, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={`btn-${i}`}
          className="fn-handle fn-handle-btn"
          style={{ left: `${((i + 1) * 100) / (buttons.length + 1)}%` }}
        />
      ))}
    </div>
  )
})
ButtonsNode.displayName = 'ButtonsNode'

// ── Action Node ───────────────────────────────────────────────

export const ActionNode = memo(({ data, selected }) => (
  <div className={`fn-node fn-action${selected ? ' fn-selected' : ''}`}>
    <Handle type="target" position={Position.Top} className="fn-handle fn-handle-in" />
    <div className="fn-badge fn-badge-action">⚡ פעולה אוטומטית</div>
    <div className="fn-node-id">{data.id}</div>
    <div className="fn-action-type">
      {data.action_type === 'check_equipment' ? '🔍 בדיקת ציוד' : data.action_type || 'בחר סוג פעולה'}
    </div>
    {data.field && (
      <div className="fn-meta">שדה: <code>{data.field}</code></div>
    )}
    <div className="fn-action-outputs">
      <span className="fn-out-success">✓ הצלחה</span>
      <span className="fn-out-failure">✕ כישלון</span>
    </div>
    <Handle
      type="source"
      position={Position.Bottom}
      id="success"
      className="fn-handle fn-handle-success"
      style={{ left: '30%' }}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      id="failure"
      className="fn-handle fn-handle-failure"
      style={{ left: '70%' }}
    />
  </div>
))
ActionNode.displayName = 'ActionNode'

// ── Done Node ─────────────────────────────────────────────────

export const DoneNode = memo(({ data, selected }) => (
  <div className={`fn-node fn-done${selected ? ' fn-selected' : ''}`}>
    <Handle type="target" position={Position.Top} className="fn-handle fn-handle-in" />
    <div className="fn-done-icon">✓</div>
    <div className="fn-done-title">סיום שיחה</div>
    <div className="fn-text">
      {data.text || <span className="fn-placeholder">הגדר הודעת סיום...</span>}
    </div>
    <div className="fn-done-action">
      {data.action === 'save_service_call' ? '📋 קריאת שירות' : '💬 שמור הודעה'}
    </div>
  </div>
))
DoneNode.displayName = 'DoneNode'
