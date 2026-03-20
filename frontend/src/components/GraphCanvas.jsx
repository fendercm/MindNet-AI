import React, { useCallback, useState, useEffect } from 'react'
import ReactFlow, {
  addEdge, Background, Controls, useNodesState, useEdgesState
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api/client'

const GraphCanvas = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [newNodeTitle, setNewNodeTitle] = useState('')

  useEffect(() => {
    loadGraph()
  }, [])

  const loadGraph = async () => {
    const data = await api.getGraph()

    const flowNodes = data.nodes.map(n => ({
      id: n.id,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: `${n.title} (L${n.level})` }
    }))

    const flowEdges = data.edges.map(e => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.relation_type
    }))

    setNodes(flowNodes)
    setEdges(flowEdges)
  }

  const onConnect = useCallback(
    (params) => {
      api.createEdge({
        from_node: params.source,
        to_node: params.target,
        relation_type: 'related_to'
      })
      setEdges((eds) => addEdge(params, eds))
    },
    [setEdges]
  )

  const addNode = async () => {
    if (!newNodeTitle.trim()) return

    const node = await api.createNode({
      title: newNodeTitle,
      description: '',
      node_type: 'skill',
      level: 1
    })

    setNodes((nds) =>
      nds.concat({
        id: node.id,
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        data: { label: `${node.title} (L${node.level})` }
      })
    )
    setNewNodeTitle('')
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: 'white',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <input
          value={newNodeTitle}
          onChange={(e) => setNewNodeTitle(e.target.value)}
          placeholder="Название навыка"
          style={{ padding: '8px', marginRight: '8px' }}
        />
        <button onClick={addNode} style={{ padding: '8px 16px' }}>
          Добавить узел
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

export default GraphCanvas