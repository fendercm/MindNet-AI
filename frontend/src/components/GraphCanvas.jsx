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
  const [project, setProject] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [showPanel, setShowPanel] = useState(false)

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

  const generateProject = async () => {
    setLoading(true)
    try {
      const result = await api.generateProject()
      setProject(result)
      setShowPanel(true)
    } catch (error) {
      console.error('Error generating project:', error)
      alert('Ошибка генерации проекта. Проверь API ключ OpenAI.')
    }
    setLoading(false)
  }

  const loadRecommendations = async () => {
    try {
      const result = await api.getRecommendations()
      setRecommendations(result.recommendations || [])
      setShowPanel(true)
    } catch (error) {
      console.error('Error loading recommendations:', error)
    }
  }
    const clearBoard = async () => {
      if (window.confirm('Удалить все узлы и связи?')) {
        // Очищаем локальное состояние
        setNodes([])
        setEdges([])
        setProject(null)
        setRecommendations([])

        // TODO: Здесь можно добавить API endpoint для очистки базы данных
        // Пока просто очищаем визуальную часть
        alert('Доска очищена! (Примечание: данные в базе остались)')
      }
    }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* Верхняя панель */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1000,
        background: 'white',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <input
          value={newNodeTitle}
          onChange={(e) => setNewNodeTitle(e.target.value)}
          placeholder="Название навыка"
          style={{ padding: '8px', width: '200px' }}
        />
        <button onClick={addNode} style={{ padding: '8px 16px' }}>
          Добавить узел
        </button>
        <button
          onClick={generateProject}
          style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
          disabled={loading}
        >
          {loading ? 'Генерация...' : '🤖 Придумать проект'}
        </button>
        <button
          onClick={loadRecommendations}
          style={{ padding: '8px 16px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          💡 Рекомендации
        </button>
          </div>
          <button
      onClick={clearBoard}
      style={{
        padding: '8px 16px',
        background: '#f44336',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      🗑️ Очистить доску
    </button>

      {/* Панель с результатом ИИ */}
      {showPanel && (
        <div style={{
          position: 'absolute',
          top: 70,
          right: 20,
          zIndex: 1000,
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: '350px',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          <button
            onClick={() => setShowPanel(false)}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer'
            }}
          >
            ×
          </button>

          {project && (
            <div>
              <h3 style={{ marginTop: 0, color: '#4CAF50' }}>🎯 Проект для тебя</h3>
              <h4 style={{ margin: '10px 0' }}>{project.title}</h4>
              <p style={{ fontSize: '14px', color: '#666' }}>{project.description}</p>
              <div style={{ marginTop: '15px' }}>
                <strong>Технологии:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                  {project.technologies?.map((tech, i) => (
                    <span key={i} style={{
                      background: '#e0e0e0',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: '10px', fontSize: '13px' }}>
                <p>⏱️ Время: ~{project.estimated_hours} ч.</p>
                <p>📊 Сложность: {project.difficulty}</p>
              </div>
            </div>
          )}

          {recommendations.length > 0 && (
            <div>
              <h3 style={{ marginTop: 0, color: '#2196F3' }}>💡 Рекомендации</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>Изучи дальше:</p>
              <ul style={{ paddingLeft: '20px' }}>
                {recommendations.map((rec, i) => (
                  <li key={i} style={{ marginBottom: '8px' }}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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