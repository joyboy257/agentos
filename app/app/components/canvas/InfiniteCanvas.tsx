'use client'

import { useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { CanvasProvider, useCanvas } from './CanvasProvider'
import AgentNode from './AgentNode'
import LabeledEdge from './LabeledEdge'
import { NodeDetailPanel } from './NodeDetailPanel'

const nodeTypes = {
  agent: AgentNode,
}

const edgeTypes = {
  labeled: LabeledEdge,
}

function CanvasContent() {
  const { nodes, edges, setSelectedNodeId } = useCanvas()

  // Listen for node-select events from AgentNode
  useEffect(() => {
    const handleNodeSelect = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>
      setSelectedNodeId(customEvent.detail.id)
    }
    document.addEventListener('node-select', handleNodeSelect)
    return () => document.removeEventListener('node-select', handleNodeSelect)
  }, [setSelectedNodeId])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#f0f0ec',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2}
        style={{
          background: '#f0f0ec',
        }}
      >
        <Background
          color="#d4d4d1"
          gap={20}
          size={1}
        />
        <Controls
          style={{
            background: '#ffffff',
            border: '1px solid #e5e5e3',
            borderRadius: 8,
          }}
        />
      </ReactFlow>
      <NodeDetailPanel />
    </div>
  )
}

export function InfiniteCanvas() {
  return (
    <CanvasProvider>
      <CanvasContent />
    </CanvasProvider>
  )
}
