import { useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { StartNode, StepNode, ButtonsNode, ActionNode, DoneNode } from './FlowNodes'
import SidePanel from './SidePanel'
import { flowToScript } from './flowUtils'

const nodeTypes = {
  startNode: StartNode,
  stepNode: StepNode,
  buttonsNode: ButtonsNode,
  actionNode: ActionNode,
  doneNode: DoneNode,
}

export default function FlowCanvas({ initialNodes, initialEdges, scriptId, originalScript, onSave, onBack }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Connect two nodes by dragging
  const onConnect = useCallback(
    (params) => setEdges(eds => addEdge({ ...params, type: 'smoothstep' }, eds)),
    []
  )

  // Select node for editing
  function onNodeClick(_, node) {
    setSelectedNode(node)
  }

  function onPaneClick() {
    setSelectedNode(null)
  }

  // Update node data from side panel
  function updateNodeData(id, newData) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: newData } : n))
    setSelectedNode(prev => prev?.id === id ? { ...prev, data: newData } : prev)
  }

  // Edit script name directly from toolbar (synced to Start Node data)
  function handleNameChange(value) {
    setNodes(nds => nds.map(n =>
      n.id === '__start__' ? { ...n, data: { ...n.data, name: value } } : n
    ))
  }
  const scriptName = nodes.find(n => n.id === '__start__')?.data?.name || ''

  // Delete a node + its edges
  function deleteNode(id) {
    setNodes(nds => nds.filter(n => n.id !== id))
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id))
    setSelectedNode(null)
  }

  // Add new step node
  function addStepNode() {
    const id = `STEP_${Date.now()}`
    setNodes(nds => [...nds, {
      id,
      type: 'stepNode',
      position: { x: 170, y: 250 + nds.length * 30 },
      data: { id, type: 'text_input', text: '', save_to: '' },
    }])
  }

  // Add new buttons node
  function addButtonsNode() {
    const id = `STEP_${Date.now()}`
    setNodes(nds => [...nds, {
      id,
      type: 'buttonsNode',
      position: { x: 170, y: 250 + nds.length * 30 },
      data: {
        id,
        type: 'buttons',
        text: '',
        buttons: [
          { id: 'btn_1', title: '', next_step: '' },
          { id: 'btn_2', title: '', next_step: '' },
        ],
      },
    }])
  }

  // Add new action node
  function addActionNode() {
    const id = `ACTION_${Date.now()}`
    setNodes(nds => [...nds, {
      id,
      type: 'actionNode',
      position: { x: 170, y: 250 + nds.length * 30 },
      data: { id, action_type: 'check_equipment', field: 'device_number', on_success: '', on_failure: '' },
    }])
  }

  // Add new done node
  function addDoneNode() {
    const id = `DONE_${Date.now()}`
    setNodes(nds => [...nds, {
      id,
      type: 'doneNode',
      position: { x: 170, y: 250 + nds.length * 30 },
      data: { id, text: '', action: 'save_service_call' },
    }])
  }

  // Save — always PUT (server does upsert); avoids POST name-required validation
  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const script = flowToScript(nodes, edges, originalScript)
      console.log('[FlowEditor] Saving script:', script.script_id, script)
      const res = await fetch(`/api/bot-scripts/${script.script_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(script),
      })
      const data = await res.json()
      console.log('[FlowEditor] Save response:', data)
      if (data.ok) {
        setSaveMsg('נשמר בהצלחה!')
        onSave?.(script)
      } else {
        setSaveMsg(`שגיאה: ${data.error}`)
        console.error('[FlowEditor] Save failed:', data.error)
      }
    } catch (e) {
      setSaveMsg(`שגיאה: ${e.message}`)
      console.error('[FlowEditor] Save exception:', e)
    }
    setSaving(false)
  }

  // Keep selected node in sync when nodes change
  const syncedSelectedNode = useMemo(
    () => selectedNode ? nodes.find(n => n.id === selectedNode.id) || null : null,
    [selectedNode, nodes]
  )

  return (
    <div className="fc-wrapper">
      {/* Top toolbar */}
      <div className="fc-toolbar">
        <button className="fc-back-btn" onClick={onBack}>→ חזרה לרשימה</button>
        <input
          className="fc-title-input"
          value={scriptName}
          onChange={e => handleNameChange(e.target.value)}
          placeholder="שם התסריט..."
        />
        <div className="fc-toolbar-right">
          <button className="fc-add-btn" onClick={addStepNode}>+ שאלה פתוחה</button>
          <button className="fc-add-btn" onClick={addButtonsNode}>+ שאלת בחירה</button>
          <button className="fc-add-btn fc-add-action" onClick={addActionNode}>+ בדיקה</button>
          <button className="fc-add-btn" onClick={addDoneNode}>+ סיום</button>
          {saveMsg && (
            <span className={`fc-save-msg ${saveMsg.includes('שגיאה') ? 'fc-error' : 'fc-success'}`}>
              {saveMsg}
            </span>
          )}
          <button className="fc-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>
      </div>

      {/* Canvas + side panel */}
      <div className="fc-body">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode="Delete"
          minZoom={0.3}
          maxZoom={2}
        >
          <Background color="#E2E8F0" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={n => {
              if (n.type === 'startNode') return '#4299E1'
              if (n.type === 'doneNode') return '#48BB78'
              if (n.type === 'buttonsNode') return '#805AD5'
              if (n.type === 'actionNode') return '#DD6B20'
              return '#718096'
            }}
          />
          <Panel position="bottom-center">
            <div className="fc-hint">
              גרור צומת להזזה · גרור קו בין נקודות לחיבור · לחץ על צומת לעריכה
            </div>
          </Panel>
        </ReactFlow>

        {syncedSelectedNode && (
          <SidePanel
            node={syncedSelectedNode}
            onUpdate={updateNodeData}
            onDelete={deleteNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  )
}
