import ChatPanel from './ChatPanel'
import React, { useCallback, useState, useEffect, useMemo } from 'react'
import ReactFlow, {
  addEdge, Background, Controls, useNodesState, useEdgesState
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api/client'
import { toPng } from 'html-to-image'

const GraphCanvas = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLevel, setFilterLevel] = useState(0)
  const [activeCategory, setActiveCategory] = useState('all')
  const [addingFromText, setAddingFromText] = useState(false)
  const [project, setProject] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    loadGraph()
  }, [])

  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      if (searchQuery && !node.data.label.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      if (filterLevel > 0 && node.data.level !== filterLevel) {
        return false
      }
      if (activeCategory !== 'all' && node.data.category !== activeCategory) {
        return false
      }
      return true
    })
  }, [nodes, searchQuery, filterLevel, activeCategory])

  const loadGraph = async () => {
    const data = await api.getGraph()
    console.log('📊 Graph data:', data)

    const flowNodes = data.nodes.map((n) => {
      let level = n.level || 1
      if (!n.level && n.description) {
        const match = n.description.match(/Level (\d+)/)
        if (match) level = parseInt(match[1])
      }

      let category = 'other'
      if (n.description) {
        const catMatch = n.description.match(/^(language|framework|library|database|tool|concept)/i)
        if (catMatch) category = catMatch[1].toLowerCase()
      }

      const levelColors = {
        1: { background: '#FFEB3B', border: '#FBC02D' },
        2: { background: '#8BC34A', border: '#689F38' },
        3: { background: '#4CAF50', border: '#388E3C' },
        4: { background: '#2196F3', border: '#1976D2' },
        5: { background: '#9C27B0', border: '#7B1FA2' },
      }

      const colors = levelColors[level] || levelColors[1]
      const isMatched = searchQuery && n.title && n.title.toLowerCase().includes(searchQuery.toLowerCase())

      return {
        id: n.id,
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        style: {
          background: colors.background,
          border: isMatched ? '3px solid #FF5722' : '2px solid ' + colors.border,
          borderRadius: '8px',
          padding: '10px',
          fontWeight: 'bold',
          color: level >= 3 ? 'white' : 'black',
          boxShadow: isMatched ? '0 0 15px rgba(255,87,34,0.5)' : 'none',
          minWidth: '120px',
          textAlign: 'center'
        },
        data: { label: `${n.title} (L${level})`, level, category }
      }
    })

    const flowEdges = data.edges.map(e => {
  console.log('🔗 Creating edge from backend:', e)

  return {
    id: e.id || `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.relation_type || '',
    type: 'smoothstep', // Тип линии
    animated: false,
    style: {
      stroke: '#666',
      strokeWidth: 2,
    },
    markerEnd: {
      type: 'arrowclosed',
      color: '#666',
      width: 20,
      height: 20,
    },
    labelStyle: {
      fill: '#666',
      fontWeight: 500,
      fontSize: 10,
      background: 'white',
      padding: 2
    },
    labelBgPadding: 4,
    labelBgBorderRadius: 2,
    labelBgFill: 'white'
  }
})

    console.log('✅ Nodes:', flowNodes.length, 'Edges:', flowEdges.length)
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
      const response = await fetch('http://localhost:8000/ai/add-skills/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: descriptionText })
      })
      const result = await response.json()
      if (result.error) {
        alert('Ошибка: ' + result.error)
        return
      }
      await loadGraph()
      setDescriptionText('')
      alert(`✅ Добавлено ${result.skills.length} навыков!`)
    } catch (error) {
      console.error('Error:', error)
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
      console.error('Error:', error)
      alert('Ошибка генерации проекта')
    }
    setLoading(false)
  }

  const loadRecommendations = async () => {
    try {
      const result = await api.getRecommendations()
      setRecommendations(result.recommendations || [])
      setShowPanel(true)
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const exportGraph = async () => {
    const element = document.querySelector('.react-flow__viewport')
    if (!element) return
    try {
      const dataUrl = await toPng(element, {
        backgroundColor: '#f8f9fa',
        quality: 1.0,
        pixelRatio: 2
      })
      const link = document.createElement('a')
      link.download = `mindnet-graph-${new Date().toISOString().slice(0,10)}.png`
      link.href = dataUrl
      link.click()
      alert('✅ Граф сохранён!')
    } catch (error) {
      console.error('Export error:', error)
      alert('❌ Ошибка при экспорте')
    }
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
        await loadGraph()
        alert(`✅ Создано ${result.connections.length} связей!\n\n` +
              result.connections.map(c => `${c.from} → ${c.to} (${c.type})`).join('\n'))
      } else {
        alert('⚠️ Связи не найдены')
      }
    } catch (error) {
      console.error('Error suggesting connections:', error)
      alert('Ошибка при создании связей: ' + error.message)
    }
  }

  const clearBoard = async () => {
    if (window.confirm('⚠️ Удалить ВСЕ узлы и связи?')) {
      try {
        setLoading(true)
        await api.clearAll()
        setNodes([])
        setEdges([])
        setProject(null)
        setRecommendations([])
        setShowPanel(false)
        alert('✅ Доска очищена!')
      } catch (error) {
        console.error('Error:', error)
        alert('❌ Ошибка: ' + error.message)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div style={{
        position: 'absolute', top: 10, left: 10, right: 420, zIndex: 1000,
        background: 'white', padding: '10px', borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)', display: 'flex',
        flexDirection: 'column', gap: '10px'
      }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)}
            placeholder="Название навыка" style={{ padding: '8px', width: '150px' }} />
          <button onClick={addNode} style={{ padding: '8px 16px' }}>Добавить</button>
          <button onClick={generateProject} disabled={loading}
            style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}>
            {loading ? '...' : '🤖 Проект'}
          </button>
          <button onClick={loadRecommendations} disabled={loading}
            style={{ padding: '8px 16px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px' }}>
            💡 Рекомендации
          </button>
          <button onClick={() => setChatOpen(true)}
            style={{ padding: '8px 16px', background: '#FF5722', color: 'white', border: 'none', borderRadius: '4px' }}>
            💬 Чат
          </button>
          <button onClick={suggestConnections} disabled={loading}
            style={{ padding: '8px 16px', background: '#FF9800', color: 'white', border: 'none', borderRadius: '4px' }}>
            🔗 Авто-связи
          </button>
          <button onClick={exportGraph}
            style={{ padding: '8px 16px', background: '#00BCD4', color: 'white', border: 'none', borderRadius: '4px' }}>
            📸 Экспорт
          </button>
          <button onClick={clearBoard} disabled={loading}
            style={{ padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}>
            🗑️ Очистить
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
          <input value={descriptionText} onChange={(e) => setDescriptionText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSkillsFromDescription()}
            placeholder="📝 Расскажи о проекте..." style={{ padding: '8px', flex: 1, borderRadius: '4px', border: '1px solid #ddd' }}
            disabled={addingFromText} />
          <button onClick={addSkillsFromDescription} disabled={addingFromText}
            style={{ padding: '8px 16px', background: '#9C27B0', color: 'white', border: 'none', borderRadius: '4px' }}>
            {addingFromText ? '🤖...' : '✨ Добавить'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#666' }}>
          <span>📌 language</span><span>📌 framework</span><span>📌 library</span><span>📌 database</span>
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 140, left: 10, zIndex: 999, background: 'white',
        padding: '10px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', maxWidth: 'calc(100% - 420px)'
      }}>
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Поиск..." style={{ padding: '6px 10px', width: '150px', borderRadius: '4px', border: '1px solid #ddd' }} />
        <select value={filterLevel} onChange={(e) => setFilterLevel(Number(e.target.value))}
          style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ddd' }}>
          <option value={0}>Все уровни</option>
          {[1,2,3,4,5].map(l => <option key={l} value={l}>L{l}</option>)}
        </select>
        {['all','language','framework','library','database','tool'].map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            style={{ padding: '6px 12px', background: activeCategory===cat?'#9C27B0':'#f0f0f0',
              color: activeCategory===cat?'white':'black', border:'none', borderRadius:'4px', fontSize:'12px' }}>
            {cat==='all'?'Все':cat}
          </button>
        ))}
        <button onClick={() => { setSearchQuery(''); setFilterLevel(0); setActiveCategory('all'); }}
          style={{ padding: '6px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px' }}>
          Сброс
        </button>
      </div>

      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}

      {showPanel && (
        <div style={{
          position: 'absolute', top: 70, right: 20, zIndex: 1000, background: 'white',
          padding: '20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: '350px', maxHeight: '400px', overflowY: 'auto'
        }}>
          <button onClick={() => setShowPanel(false)} style={{
            position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
          {project && (
            <div>
              <h3 style={{ marginTop: 0, color: '#4CAF50' }}>🎯 Проект</h3>
              <h4>{project.title}</h4>
              <p style={{ fontSize: '14px', color: '#666' }}>{project.description}</p>
              <div style={{ marginTop: '10px' }}>
                <strong>Технологии:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                  {project.technologies?.map((tech, i) => (
                    <span key={i} style={{ background: '#e0e0e0', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>{tech}</span>
                  ))}
                </div>
              </div>
              <p style={{ marginTop: '10px', fontSize: '13px' }}>⏱️ ~{project.estimated_hours} ч. • {project.difficulty}</p>
            </div>
          )}
          {recommendations.length > 0 && (
            <div>
              <h3 style={{ marginTop: 0, color: '#2196F3' }}>💡 Рекомендации</h3>
              <ul style={{ paddingLeft: '20px' }}>
                {recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <ReactFlow
        nodes={filteredNodes}
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