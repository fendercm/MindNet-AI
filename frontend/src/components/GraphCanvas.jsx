// frontend/src/components/GraphCanvas.jsx
import ChatPanel from './ChatPanel'
import React, { useCallback, useState, useEffect, useMemo } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api/client'
import { toPng } from 'html-to-image'

// ─── Цвета по уровням ───────────────────────────────────────
const LEVEL_COLORS = {
  1: { bg: '#FFF9C4', border: '#F9A825', text: '#333' },
  2: { bg: '#DCEDC8', border: '#7CB342', text: '#333' },
  3: { bg: '#C8E6C9', border: '#388E3C', text: '#fff' },
  4: { bg: '#BBDEFB', border: '#1565C0', text: '#fff' },
  5: { bg: '#E1BEE7', border: '#6A1B9A', text: '#fff' },
}

const TYPE_ICONS = {
  language:  '💻',
  framework: '⚡',
  library:   '📦',
  database:  '🗄️',
  tool:      '🔧',
  skill:     '🧠',
  concept:   '💡',
}

// ─── Layout: расставляем узлы по группам ────────────────────
const applyLayout = (nodes) => {
  if (!nodes.length) return nodes

  // Группируем по node_type
  const groups = {}
  nodes.forEach(n => {
    const t = n.data.node_type || 'skill'
    if (!groups[t]) groups[t] = []
    groups[t].push(n)
  })

  const COLS_PER_GROUP = 3
  const NODE_W = 180
  const NODE_H = 80
  const GROUP_GAP_X = 260
  const GROUP_GAP_Y = 160

  const result = []
  const groupKeys = Object.keys(groups)

  groupKeys.forEach((type, gi) => {
    const groupNodes = groups[type]
    const groupCol = gi % 3
    const groupRow = Math.floor(gi / 3)

    const baseX = groupCol * (COLS_PER_GROUP * NODE_W + GROUP_GAP_X)
    const baseY = groupRow * (2 * NODE_H + GROUP_GAP_Y)

    groupNodes.forEach((node, idx) => {
      const col = idx % COLS_PER_GROUP
      const row = Math.floor(idx / COLS_PER_GROUP)
      result.push({
        ...node,
        position: {
          x: baseX + col * (NODE_W + 20),
          y: baseY + row * (NODE_H + 20),
        },
      })
    })
  })

  return result
}

// ─── Парсим level и category из узла ────────────────────────
const parseNode = (n) => {
  let level = n.level || 1
  let node_type = n.node_type || 'skill'
  let category = node_type

  // Если level приходит внутри description "skill • Level 3"
  if (!n.level && n.description) {
    const m = n.description.match(/Level\s*(\d+)/i)
    if (m) level = parseInt(m[1])
    const catM = n.description.match(/^(language|framework|library|database|tool|concept)/i)
    if (catM) {
      node_type = catM[1].toLowerCase()
      category  = node_type
    }
  }

  return { level: Math.min(Math.max(level, 1), 5), node_type, category }
}

// ─── Главный компонент ───────────────────────────────────────
const GraphCanvas = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [newNodeTitle,    setNewNodeTitle]    = useState('')
  const [descriptionText, setDescriptionText] = useState('')
  const [chatOpen,        setChatOpen]        = useState(false)
  const [searchQuery,     setSearchQuery]     = useState('')
  const [filterLevel,     setFilterLevel]     = useState(0)
  const [activeCategory,  setActiveCategory]  = useState('all')
  const [addingFromText,  setAddingFromText]  = useState(false)
  const [project,         setProject]         = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading,         setLoading]         = useState(false)
  const [showPanel,       setShowPanel]       = useState(false)
  const [notification,    setNotification]    = useState(null)

  useEffect(() => { loadGraph() }, [])

  // ── Уведомления ──────────────────────────────────────────
  const notify = (text, ok = true) => {
    setNotification({ text, ok })
    setTimeout(() => setNotification(null), 3500)
  }

  // ── Загрузка графа ────────────────────────────────────────
  const loadGraph = async () => {
    try {
      const data = await api.getGraph()
      console.log('📊 Graph:', data)

      const rawNodes = data.nodes || []
      const rawEdges = data.edges || []

      // Строим узлы
      const flowNodes = rawNodes.map(n => {
        const { level, node_type, category } = parseNode(n)
        const colors = LEVEL_COLORS[level] || LEVEL_COLORS[1]
        const icon   = TYPE_ICONS[node_type] || TYPE_ICONS.skill

        return {
          id:       n.id,
          position: { x: 0, y: 0 }, // layout расставит
          data: {
            label:     `${icon} ${n.title}\nL${level}`,
            level,
            node_type,
            category,
            title:     n.title,
          },
          style: {
            background:   colors.bg,
            border:       `2px solid ${colors.border}`,
            borderRadius: '10px',
            padding:      '8px 12px',
            fontWeight:   '600',
            color:        colors.text,
            minWidth:     '130px',
            textAlign:    'center',
            fontSize:     '13px',
            lineHeight:   '1.4',
            boxShadow:    '0 2px 8px rgba(0,0,0,0.15)',
          },
        }
      })

      // Строим рёбра
      const flowEdges = rawEdges.map(e => {
        console.log('🔗 Edge:', e)
        return {
          id:     e.id || `${e.from}-${e.to}-${Date.now()}`,
          source: String(e.from),
          target: String(e.to),
          label:  e.relation_type || '',
          type:   'smoothstep',
          animated: e.relation_type === 'requires',
          style: { stroke: '#6c63ff', strokeWidth: 2 },
          markerEnd: {
            type:  MarkerType.ArrowClosed,
            color: '#6c63ff',
          },
          labelStyle: {
            fontSize:   10,
            fontWeight: 600,
            fill:       '#555',
          },
          labelBgPadding:      [4, 2],
          labelBgBorderRadius: 3,
          labelBgStyle:        { fill: '#fff', fillOpacity: 0.85 },
        }
      })

      // Применяем layout
      const positioned = applyLayout(flowNodes)

      setNodes(positioned)
      setEdges(flowEdges)
      console.log(`✅ ${positioned.length} узлов, ${flowEdges.length} рёбер`)

    } catch (err) {
      console.error('loadGraph error:', err)
      notify('❌ Ошибка загрузки графа', false)
    }
  }

  // ── Фильтрация (не меняем позиции!) ──────────────────────
  const filteredNodes = useMemo(() => {
    return nodes.map(n => {
      const hidden =
        (searchQuery && !n.data.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (filterLevel > 0 && n.data.level !== filterLevel) ||
        (activeCategory !== 'all' && n.data.category !== activeCategory)

      return {
        ...n,
        style: {
          ...n.style,
          opacity:   hidden ? 0.15 : 1,
          transform: hidden ? 'scale(0.95)' : 'scale(1)',
        },
      }
    })
  }, [nodes, searchQuery, filterLevel, activeCategory])

  // ── Ручное соединение ─────────────────────────────────────
  const onConnect = useCallback((params) => {
    api.createEdge({
      from_node:     params.source,
      to_node:       params.target,
      relation_type: 'related_to',
    })
    setEdges(eds => addEdge({
      ...params,
      type:      'smoothstep',
      style:     { stroke: '#6c63ff', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6c63ff' },
    }, eds))
  }, [setEdges])

  // ── Добавить навык вручную ────────────────────────────────
  const addNode = async () => {
    if (!newNodeTitle.trim()) return
    try {
      const node = await api.createNode({
        title:       newNodeTitle,
        description: '',
        node_type:   'skill',
        level:       1,
      })
      await loadGraph()
      setNewNodeTitle('')
      notify(`✅ Добавлен: ${newNodeTitle}`)
    } catch (err) {
      notify('❌ Ошибка добавления', false)
    }
  }

  // ── Добавить навыки из текста ─────────────────────────────
  const addSkillsFromDescription = async () => {
    if (!descriptionText.trim()) return
    setAddingFromText(true)
    try {
      const resp = await fetch('http://localhost:8000/ai/add-skills/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: descriptionText }),
      })
      const result = await resp.json()
      if (result.error) { notify('❌ ' + result.error, false); return }
      await loadGraph()
      setDescriptionText('')
      notify(`✅ Добавлено ${result.skills?.length || 0} навыков!`)
    } catch (err) {
      notify('❌ Ошибка: ' + err.message, false)
    } finally {
      setAddingFromText(false)
    }
  }

  // ── Авто-связи ────────────────────────────────────────────
  const suggestConnections = async () => {
    setLoading(true)
    try {
      const resp = await fetch('http://localhost:8000/ai/suggest-connections/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await resp.json()
      if (result.error) { notify('❌ ' + result.error, false); return }
      await loadGraph()
      notify(`🔗 Создано ${result.created || 0} связей!`)
    } catch (err) {
      notify('❌ ' + err.message, false)
    } finally {
      setLoading(false)
    }
  }

  // ── Генерация проекта ─────────────────────────────────────
  const generateProject = async () => {
    setLoading(true)
    try {
      const result = await api.generateProject()
      setProject(result)
      setRecommendations([])
      setShowPanel(true)
      notify('🎯 Проект сгенерирован!')
    } catch (err) {
      notify('❌ ' + err.message, false)
    } finally {
      setLoading(false)
    }
  }

  // ── Рекомендации ──────────────────────────────────────────
  const loadRecommendations = async () => {
    try {
      const result = await api.getRecommendations()
      setRecommendations(result.recommendations || [])
      setProject(null)
      setShowPanel(true)
      notify('💡 Рекомендации готовы!')
    } catch (err) {
      notify('❌ ' + err.message, false)
    }
  }

  // ── Экспорт ───────────────────────────────────────────────
  const exportGraph = async () => {
    const el = document.querySelector('.react-flow__viewport')
    if (!el) return
    try {
      const url = await toPng(el, {
        backgroundColor: '#f8f9fa',
        quality: 1,
        pixelRatio: 2,
      })
      const a = document.createElement('a')
      a.download = `mindnet-${new Date().toISOString().slice(0, 10)}.png`
      a.href = url
      a.click()
      notify('📸 Граф сохранён!')
    } catch (err) {
      notify('❌ Ошибка экспорта', false)
    }
  }

  // ── Очистить ──────────────────────────────────────────────
  const clearBoard = async () => {
    if (!window.confirm('⚠️ Удалить ВСЕ узлы и связи?')) return
    setLoading(true)
    try {
      await api.clearAll()
      setNodes([])
      setEdges([])
      setProject(null)
      setRecommendations([])
      setShowPanel(false)
      notify('✅ Доска очищена!')
    } catch (err) {
      notify('❌ ' + err.message, false)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────
  //  РЕНДЕР
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e' }}>

      {/* ── Уведомление ── */}
      {notification && (
        <div style={{
          position:     'fixed',
          bottom:       24,
          right:        24,
          zIndex:       9999,
          background:   notification.ok ? '#1b5e20' : '#b71c1c',
          color:        '#fff',
          padding:      '12px 20px',
          borderRadius: '10px',
          fontWeight:   600,
          boxShadow:    '0 4px 20px rgba(0,0,0,0.4)',
          animation:    'fadeIn .3s ease',
        }}>
          {notification.text}
        </div>
      )}

      {/* ── Верхняя панель ── */}
      <div style={{
        position:     'absolute',
        top: 10, left: 10, right: showPanel ? 380 : 10,
        zIndex:       1000,
        background:   'rgba(16,16,40,0.97)',
        backdropFilter: 'blur(12px)',
        padding:      '12px 16px',
        borderRadius: '12px',
        boxShadow:    '0 4px 24px rgba(0,0,0,0.5)',
        border:       '1px solid rgba(108,99,255,0.3)',
        display:      'flex',
        flexDirection:'column',
        gap:          '10px',
      }}>

        {/* Строка 1: кнопки */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Лого */}
          <span style={{ fontWeight: 800, color: '#a78bfa', fontSize: 16, marginRight: 4 }}>
            🧠 MindNet
          </span>

          <input
            value={newNodeTitle}
            onChange={e => setNewNodeTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNode()}
            placeholder="Название навыка"
            style={inputStyle}
          />
          <Btn onClick={addNode} color="#6c63ff">+ Добавить</Btn>
          <Btn onClick={generateProject}    color="#4CAF50" disabled={loading}>🤖 Проект</Btn>
          <Btn onClick={loadRecommendations} color="#2196F3" disabled={loading}>💡 Рекомендации</Btn>
          <Btn onClick={() => setChatOpen(true)} color="#FF5722">💬 Чат</Btn>
          <Btn onClick={suggestConnections} color="#FF9800" disabled={loading}>🔗 Авто-связи</Btn>
          <Btn onClick={exportGraph}        color="#00BCD4">📸 Экспорт</Btn>
          <Btn onClick={clearBoard}         color="#f44336" disabled={loading}>🗑️ Очистить</Btn>

          {loading && (
            <span style={{ color: '#a78bfa', fontSize: 13 }}>⏳ Загрузка...</span>
          )}
        </div>

        {/* Строка 2: добавить из текста */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={descriptionText}
            onChange={e => setDescriptionText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addSkillsFromDescription()}
            placeholder="📝 Расскажи о своём проекте — ИИ извлечёт навыки..."
            disabled={addingFromText}
            style={{ ...inputStyle, flex: 1 }}
          />
          <Btn
            onClick={addSkillsFromDescription}
            disabled={addingFromText}
            color="#9C27B0"
          >
            {addingFromText ? '🤖 Анализ...' : '✨ Добавить'}
          </Btn>
        </div>

        {/* Строка 3: фильтры */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Поиск..."
            style={{ ...inputStyle, width: 140 }}
          />
          <select
            value={filterLevel}
            onChange={e => setFilterLevel(Number(e.target.value))}
            style={selectStyle}
          >
            <option value={0}>Все уровни</option>
            {[1,2,3,4,5].map(l => <option key={l} value={l}>L{l}</option>)}
          </select>
          {['all','language','framework','library','database','tool'].map(cat => (
            <FilterBtn
              key={cat}
              label={cat === 'all' ? 'Все' : cat}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            />
          ))}
          <Btn
            onClick={() => { setSearchQuery(''); setFilterLevel(0); setActiveCategory('all') }}
            color="#f44336"
            small
          >
            Сброс
          </Btn>
        </div>
      </div>

      {/* ── Чат ── */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}

      {/* ── Боковая панель ── */}
      {showPanel && (
        <div style={{
          position:     'absolute',
          top: 10, right: 10,
          zIndex:       1000,
          width:        360,
          maxHeight:    '85vh',
          overflowY:    'auto',
          background:   'rgba(16,16,40,0.97)',
          border:       '1px solid rgba(108,99,255,0.3)',
          borderRadius: '12px',
          padding:      '20px',
          boxShadow:    '0 4px 24px rgba(0,0,0,0.5)',
          color:        '#e2e8f0',
        }}>
          <button
            onClick={() => setShowPanel(false)}
            style={{ position:'absolute', top:12, right:14,
              background:'none', border:'none', color:'#94a3b8',
              fontSize:22, cursor:'pointer' }}
          >×</button>

          {project && (
            <div>
              <h3 style={{ color:'#4CAF50', marginTop:0 }}>🎯 Проект</h3>
              <h4 style={{ color:'#a78bfa' }}>{project.title}</h4>
              <p style={{ fontSize:14, color:'#94a3b8' }}>{project.description}</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
                {project.technologies?.map((t,i) => (
                  <span key={i} style={{
                    background:'rgba(108,99,255,0.2)', border:'1px solid #6c63ff',
                    borderRadius:6, padding:'3px 8px', fontSize:12, color:'#a78bfa'
                  }}>{t}</span>
                ))}
              </div>
              <p style={{ fontSize:13, color:'#64748b', marginTop:10 }}>
                ⏱️ ~{project.estimated_hours} ч. &nbsp;•&nbsp; {project.difficulty}
              </p>
            </div>
          )}

          {recommendations.length > 0 && (
            <div>
              <h3 style={{ color:'#2196F3', marginTop:0 }}>💡 Рекомендации</h3>
              <ul style={{ paddingLeft:18, lineHeight:1.8 }}>
                {recommendations.map((r,i) => (
                  <li key={i} style={{ color:'#94a3b8', fontSize:14 }}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Граф ── */}
      <ReactFlow
        nodes={filteredNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={4}
      >
        <Background color="rgba(108,99,255,0.12)" gap={28} />
        <Controls style={{
          background:'rgba(16,16,40,0.9)',
          border:'1px solid rgba(108,99,255,0.3)',
          borderRadius:10,
        }}/>
        <MiniMap
          nodeColor={n => LEVEL_COLORS[n.data?.level]?.border || '#6c63ff'}
          style={{
            background:'rgba(16,16,40,0.9)',
            border:'1px solid rgba(108,99,255,0.3)',
            borderRadius:10,
          }}
        />
      </ReactFlow>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .react-flow__node { transition: opacity .2s, transform .2s; }
      `}</style>
    </div>
  )
}

// ─── Мелкие компоненты ───────────────────────────────────────
const inputStyle = {
  padding:      '7px 12px',
  borderRadius: '8px',
  border:       '1px solid rgba(108,99,255,0.4)',
  background:   'rgba(108,99,255,0.1)',
  color:        '#e2e8f0',
  fontSize:     13,
  outline:      'none',
}

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

const Btn = ({ onClick, color, children, disabled, small }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding:      small ? '5px 10px' : '7px 14px',
      background:   disabled ? '#333' : color,
      color:        '#fff',
      border:       'none',
      borderRadius: '8px',
      fontWeight:   600,
      fontSize:     small ? 12 : 13,
      cursor:       disabled ? 'not-allowed' : 'pointer',
      opacity:      disabled ? 0.6 : 1,
      whiteSpace:   'nowrap',
      transition:   'opacity .2s',
    }}
  >
    {children}
  </button>
)

const FilterBtn = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding:      '5px 12px',
      background:   active ? 'rgba(108,99,255,0.3)' : 'transparent',
      border:       `1px solid ${active ? '#6c63ff' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: '20px',
      color:        active ? '#a78bfa' : '#64748b',
      fontSize:     12,
      cursor:       'pointer',
      transition:   'all .2s',
    }}
  >
    {label}
  </button>
)

export default GraphCanvas