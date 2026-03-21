import React, { useCallback, useState, useEffect } from 'react'
import ReactFlow, {
  addEdge, Background, Controls, useNodesState, useEdgesState
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api/client'
const API_BASE = 'http://localhost:8000'
const GraphCanvas = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [addingFromText, setAddingFromText] = useState(false)
  const [project, setProject] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    loadGraph()
  }, [])

const loadGraph = async () => {
  const data = await api.getGraph()

  // Группируем узлы по категориям
  const categories = {}

  const flowNodes = data.nodes.map((n, index) => {
    let level = n.level || 1

    if (!n.level && n.description) {
      const match = n.description.match(/Level (\d+)/)
      if (match) level = parseInt(match[1])
    }

    // Извлекаем категорию из description
    let category = 'other'
    if (n.description) {
      const catMatch = n.description.match(/^(language|framework|library|database|tool|concept)/i)
      if (catMatch) category = catMatch[1].toLowerCase()
    }

    // Позиционируем по категориям
    const categoryPositions = {
      'language': { x: 100, y: 100 },
      'framework': { x: 400, y: 100 },
      'library': { x: 700, y: 100 },
      'database': { x: 100, y: 400 },
      'tool': { x: 400, y: 400 },
      'other': { x: 700, y: 400 }
    }

    const basePos = categoryPositions[category] || categoryPositions['other']

    // Цвета для уровней
    const levelColors = {
      1: { background: '#FFEB3B', border: '#FBC02D' },
      2: { background: '#8BC34A', border: '#689F38' },
      3: { background: '#4CAF50', border: '#388E3C' },
      4: { background: '#2196F3', border: '#1976D2' },
      5: { background: '#9C27B0', border: '#7B1FA2' },
    }

    const colors = levelColors[level] || levelColors[1]

    return {
      id: n.id,
      position: {
        x: basePos.x + (index % 3) * 150,
        y: basePos.y + Math.floor(index / 3) * 100
      },
      style: {
        background: colors.background,
        border: `2px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '10px',
        fontWeight: 'bold',
        color: level >= 3 ? 'white' : 'black',
        minWidth: '120px',
        textAlign: 'center'
      },
      data: {
        label: `${n.title} (L${level})`,
        level: level,
        category: category
      }
    }
  })

  const flowEdges = data.edges.map(e => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.relation_type,
    style: { stroke: '#666', strokeWidth: 2 },
    labelStyle: { fill: '#666', fontWeight: 500 }
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
const addSkillsFromDescription = async () => {
  if (!descriptionText.trim()) return

  setAddingFromText(true)
  try {
    // Используем POST вместо GET!
    const response = await fetch('http://localhost:8000/ai/add-skills/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: descriptionText
      })
    })

    const result = await response.json()

    if (result.error) {
      alert('Ошибка: ' + result.error)
      return
    }

    // Перезагружаем граф
    await loadGraph()

    // Очищаем поле
    setDescriptionText('')

    alert(`✅ Добавлено ${result.skills.length} навыков!\n\nПробелы: ${result.gaps.map(g => g.skill).join(', ')}`)

  } catch (error) {
    console.error('Error adding skills from text:', error)
    alert('Ошибка при добавлении навыков')
  } finally {
    setAddingFromText(false)
  }
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
    if (window.confirm('⚠️ Удалить ВСЕ узлы и связи?\n\nЭто действие нельзя отменить!')) {
      try {
        setLoading(true)

        // Очищаем базу данных
        await api.clearAll()

        // Очищаем локальное состояние
        setNodes([])
        setEdges([])
        setProject(null)
        setRecommendations([])
        setShowPanel(false)

        alert('✅ Доска полностью очищена!')

      } catch (error) {
        console.error('Error clearing board:', error)
        alert('❌ Ошибка при очистке: ' + error.message)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* Верхняя панель */}
<div style={{
  position: 'absolute',
  top: 10,
  left: 10,
  right: 10,  // Добавлено!
  zIndex: 1000,
  background: 'white',
  padding: '10px',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  display: 'flex',
  flexDirection: 'column',  // Вертикально!
  gap: '10px',
}}>
  {/* Первый ряд: кнопки */}
  <div style={{
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap'
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
      disabled={loading}
    >
      💡 Рекомендации
    </button>
    <button
      onClick={clearBoard}
      style={{ padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}
      disabled={loading}
    >
      🗑️ Очистить
    </button>
  </div>

  {/* Второй ряд: поле для текста */}
  <div style={{
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    borderTop: '1px solid #eee',
    paddingTop: '10px'
  }}>
    <input
      value={descriptionText}
      onChange={(e) => setDescriptionText(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && addSkillsFromDescription()}
      placeholder="📝 Расскажи о проекте (например: 'Сделал бота на Python с FastAPI')"
      style={{
        padding: '8px',
        flex: 1,  // Занимает всё доступное место
        borderRadius: '4px',
        border: '1px solid #ddd'
      }}
      disabled={addingFromText}
    />
    <button
      onClick={addSkillsFromDescription}
      style={{
        padding: '8px 16px',
        background: '#9C27B0',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        whiteSpace: 'nowrap'
      }}
      disabled={addingFromText}
    >
      {addingFromText ? '🤖 Добавляю...' : '✨ Добавить'}
    </button>
    <button
  onClick={suggestConnections}
  style={{
    padding: '8px 16px',
    background: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  }}
  disabled={loading}
>
  🔗 Авто-связи
</button>
    {/* Легенда категорий */}
<div style={{
  display: 'flex',
  gap: '15px',
  fontSize: '12px',
  color: '#666',
  marginTop: '5px'
}}>
  <span>📌 <strong>language:</strong> Python, JS</span>
  <span>📌 <strong>framework:</strong> FastAPI, Django</span>
  <span>📌 <strong>library:</strong> aiogram, requests</span>
  <span>📌 <strong>database:</strong> SQLite, PostgreSQL</span>
</div>
  </div>
</div>

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
const suggestConnections = async () => {
  try {
    const response = await fetch('http://localhost:8000/ai/suggest-connections/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    const result = await response.json()

    if (result.error) {
      alert('Ошибка: ' + result.error)
      return
    }

    if (result.connections && result.connections.length > 0) {
      alert(`✅ Создано ${result.connections.length} связей!\n\n` +
            result.connections.map(c => `${c.from} → ${c.to} (${c.type})`).join('\n') +
            `\n\nСтраница обновится для отображения связей.`)

      // Перезагружаем страницу
      window.location.reload()
    } else {
      alert('⚠️ Связи не найдены')
    }

  } catch (error) {
    console.error('Error suggesting connections:', error)
    alert('Ошибка при создании связей: ' + error.message)
  }
}
export default GraphCanvas