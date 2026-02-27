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

// Colors per button index — chip and handle share the same palette
const BTN_COLORS = [
  { bg: '#EBF8FF', border: '#90CDF4', text: '#2B6CB0', handle: '#4299E1' }, // blue
  { bg: '#F0FFF4', border: '#9AE6B4', text: '#276749', handle: '#48BB78' }, // green
  { bg: '#FFFAF0', border: '#F6AD55', text: '#C05621', handle: '#ED8936' }, // orange
]

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
        {buttons.map((btn, i) => {
          const c = BTN_COLORS[i] || BTN_COLORS[0]
          return (
            <div
              key={i}
              className="fn-btn-chip"
              style={{ background: c.bg, borderColor: c.border, color: c.text }}
            >
              <span>{btn.title || `כפתור ${i + 1}`}</span>
            </div>
          )
        })}
      </div>
      {/* Handles placed at node root, distributed at bottom — NOT inside chips */}
      {buttons.map((btn, i) => (
        <Handle
          key={i}
          type="source"
          position={Position.Bottom}
          id={`btn-${i}`}
          className={`fn-handle fn-handle-btn fn-handle-btn-${i}`}
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
      {data.action_type === 'check_equipment' ? '🔍 בדיקת מערכת' : data.action_type || 'בחר סוג פעולה'}
    </div>
    {data.description && (
      <div className="fn-text" style={{ fontSize: 12, marginBottom: 2 }}>{data.description}</div>
    )}
    {data.field && (
      <div className="fn-meta">שדה: <code>{data.field}</code></div>
    )}
    {/* RTL layout: first item→right, second item→left. Handles: success=70%(right), failure=30%(left) */}
    <div className="fn-action-outputs">
      <span className="fn-out-failure">✕ כישלון</span>
      <span className="fn-out-success">✓ הצלחה</span>
    </div>
    {/* RTL flex: כישלון (first in HTML) → visual RIGHT, הצלחה (second) → visual LEFT */}
    {/* success handle at 30% (left), failure handle at 70% (right) — matches visual labels */}
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
