// frontend/src/components/GraphCanvas.jsx
import ChatPanel from './ChatPanel'
import React, {
  useCallback, useState, useEffect, useMemo, useRef,
} from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api/client'
import { toPng } from 'html-to-image'

// ─── Палитра уровней ──────────────────────────────────────────
const LEVEL_COLORS = {
  1: { bg: '#1e2a1e', border: '#4ade80', accent: '#4ade80', label: 'Новичок' },
  2: { bg: '#1e2630', border: '#60a5fa', accent: '#60a5fa', label: 'Базовый' },
  3: { bg: '#261e30', border: '#a78bfa', accent: '#a78bfa', label: 'Средний' },
  4: { bg: '#2a1e24', border: '#f472b6', accent: '#f472b6', label: 'Продвинутый' },
  5: { bg: '#2a2210', border: '#fbbf24', accent: '#fbbf24', label: 'Эксперт' },
}

const TYPE_ICONS = {
  language:  '💻',
  framework: '⚡',
  library:   '📦',
  database:  '🗄️',
  tool:      '🔧',
  concept:   '💡',
  skill:     '🧠',
}

const TYPE_ORDER = ['language', 'framework', 'library', 'database', 'tool', 'concept', 'skill']

// ─── Умный layout: группировка по категориям ─────────────────
const applySmartLayout = (nodes) => {
  if (!nodes.length) return nodes

  const groups = {}
  TYPE_ORDER.forEach(t => { groups[t] = [] })

  nodes.forEach(n => {
    const t = n.data.node_type || 'skill'
    if (!groups[t]) groups[t] = []
    groups[t].push(n)
  })

  const NON_EMPTY = TYPE_ORDER.filter(t => groups[t].length > 0)

  const NODE_W   = 170
  const NODE_H   = 72
  const PAD_X    = 20
  const PAD_Y    = 20
  const GROUP_GAP_X = 80
  const GROUP_GAP_Y = 100
  const HEADER_H = 36

  const result = []
  let currentX = 0

  NON_EMPTY.forEach((type) => {
    const groupNodes = groups[type]
    const cols  = Math.max(1, Math.ceil(Math.sqrt(groupNodes.length * 1.4)))
    const rows  = Math.ceil(groupNodes.length / cols)

    const groupW = cols * (NODE_W + PAD_X) - PAD_X + 40
    const groupH = HEADER_H + rows * (NODE_H + PAD_Y) - PAD_Y + 40

    groupNodes.forEach((node, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      result.push({
        ...node,
        position: {
          x: currentX + 20 + col * (NODE_W + PAD_X),
          y: HEADER_H + 20 + row * (NODE_H + PAD_Y),
        },
      })
    })

    currentX += groupW + GROUP_GAP_X
  })

  return result
}

// ─── Парсим level и node_type из узла ────────────────────────
const parseNode = (n) => {
  let level     = parseInt(n.level) || 1
  let node_type = (n.node_type || 'skill').toLowerCase()

  // Фоллбек: извлекаем из description если level не задан явно
  if ((!n.level || n.level === 1) && n.description) {
    const m = n.description.match(/Level\s*(\d+)/i)
    if (m) level = parseInt(m[1])
    const catM = n.description.match(/^(language|framework|library|database|tool|concept)/i)
    if (catM) node_type = catM[1].toLowerCase()
  }

  return {
    level:     Math.min(Math.max(level, 1), 5),
    node_type: TYPE_ORDER.includes(node_type) ? node_type : 'skill',
  }
}

// ─── Кастомная нода ───────────────────────────────────────────
const SkillNode = ({ data, selected }) => {
  const { level, node_type, title } = data
  const colors = LEVEL_COLORS[level] || LEVEL_COLORS[1]
  const icon   = TYPE_ICONS[node_type] || '🧠'

  return (
    <div style={{
      background:   colors.bg,
      border:       `1.5px solid ${selected ? '#fff' : colors.border}`,
      borderRadius: 10,
      padding:      '8px 12px 10px',
      minWidth:     150,
      maxWidth:     170,
      position:     'relative',
      boxShadow:    selected
        ? `0 0 0 2px ${colors.border}, 0 4px 20px rgba(0,0,0,0.4)`
        : '0 2px 8px rgba(0,0,0,0.3)',
      cursor:       'grab',
      userSelect:   'none',
    }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: colors.border, width: 8, height: 8, border: 'none' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 10, color: colors.accent, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {node_type}
        </span>
      </div>

      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>
        {title}
      </div>

      {/* Полоска уровня снизу */}
      <div style={{
        position:     'absolute',
        bottom:       0, left: 0, right: 0,
        height:       3,
        background:   colors.border,
        borderRadius: '0 0 10px 10px',
      }} />

      {/* Иконка уровня */}
      <div style={{
        position:   'absolute',
        top:        6, right: 8,
        fontSize:   10,
        color:      colors.accent,
        fontWeight: 800,
      }}>
        L{level}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: colors.border, width: 8, height: 8, border: 'none' }}
      />
    </div>
  )
}

const nodeTypes = { skill: SkillNode }

// ─── Цвета рёбер по типу связи ────────────────────────────────
const EDGE_COLORS = {
  requires:    '#f472b6',
  extends:     '#60a5fa',
  complements: '#4ade80',
  used_with:   '#fbbf24',
  related_to:  '#94a3b8',
}

// ─── Главный компонент ────────────────────────────────────────
const GraphCanvas = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [newNodeTitle,    setNewNodeTitle]    = useState('')
  const [newNodeType,     setNewNodeType]     = useState('skill')
  const [newNodeLevel,    setNewNodeLevel]    = useState(1)
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
  const [sidebarOpen,     setSidebarOpen]     = useState(true)
  const [dbStatus,        setDbStatus]        = useState(null)
  const [nodeCount,       setNodeCount]       = useState(0)

  useEffect(() => {
    loadGraph()
    checkHealth()
  }, [])

  const checkHealth = async () => {
    try {
      const resp = await fetch('http://localhost:8000/health')
      const data = await resp.json()
      setDbStatus(data.neo4j)
    } catch {
      setDbStatus(false)
    }
  }

  // ── Уведомления ──────────────────────────────────────────
  const notify = (text, ok = true) => {
    setNotification({ text, ok })
    setTimeout(() => setNotification(null), 3500)
  }

  // ── Загрузка графа ────────────────────────────────────────
  const loadGraph = async () => {
    try {
      const data = await api.getGraph()
      const rawNodes = data.nodes || []
      const rawEdges = data.edges || []

      const flowNodes = rawNodes.map(n => {
        const { level, node_type } = parseNode(n)
        return {
          id:       String(n.id),
          type:     'skill',
          position: { x: 0, y: 0 },
          data: {
            label:     n.title,
            title:     n.title,
            level,
            node_type,
          },
        }
      })

      const flowEdges = rawEdges.map(e => {
        const color = EDGE_COLORS[e.relation_type] || EDGE_COLORS.related_to
        return {
          id:       e.id || `${e.from}-${e.to}`,
          source:   String(e.from),
          target:   String(e.to),
          label:    e.relation_type || '',
          type:     'smoothstep',
          animated: e.relation_type === 'requires',
          style:    { stroke: color, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          labelStyle:        { fontSize: 9, fontWeight: 600, fill: color },
          labelBgPadding:    [3, 2],
          labelBgBorderRadius: 3,
          labelBgStyle:      { fill: '#0f0f23', fillOpacity: 0.9 },
        }
      })

      const positioned = applySmartLayout(flowNodes)
      setNodes(positioned)
      setEdges(flowEdges)
      setNodeCount(positioned.length)
    } catch (err) {
      console.error('loadGraph error:', err)
      notify('Ошибка загрузки графа', false)
    }
  }

  // ── Фильтрация ────────────────────────────────────────────
  const filteredNodes = useMemo(() => {
    return nodes.map(n => {
      const hidden =
        (searchQuery && !n.data.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (filterLevel > 0 && n.data.level !== filterLevel) ||
        (activeCategory !== 'all' && n.data.node_type !== activeCategory)
      return {
        ...n,
        style: { opacity: hidden ? 0.12 : 1, transition: 'opacity .2s' },
      }
    })
  }, [nodes, searchQuery, filterLevel, activeCategory])

  // ── Ручное соединение ─────────────────────────────────────
  const onConnect = useCallback((params) => {
    const color = EDGE_COLORS.related_to
    api.createEdge({ from_node: params.source, to_node: params.target, relation_type: 'related_to' })
    setEdges(eds => addEdge({
      ...params,
      type:      'smoothstep',
      style:     { stroke: color, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }, eds))
  }, [setEdges])

  // ── Добавить навык вручную ────────────────────────────────
  const addNode = async () => {
    if (!newNodeTitle.trim()) return
    try {
      await api.createNode({
        title:       newNodeTitle.trim(),
        description: '',
        node_type:   newNodeType,
        level:       newNodeLevel,
      })
      await loadGraph()
      setNewNodeTitle('')
      notify(`Добавлен: ${newNodeTitle}`)
    } catch {
      notify('Ошибка добавления', false)
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
      if (result.error) { notify(result.error, false); return }
      await loadGraph()
      setDescriptionText('')
      notify(`Добавлено ${result.skills?.length || 0} навыков`)
    } catch (err) {
      notify('Ошибка: ' + err.message, false)
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
      if (result.error) { notify(result.error, false); return }
      await loadGraph()
      notify(`Создано ${result.created || 0} связей`)
    } catch (err) {
      notify(err.message, false)
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
      notify('Проект сгенерирован!')
    } catch (err) {
      notify(err.message, false)
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
      notify('Рекомендации готовы!')
    } catch (err) {
      notify(err.message, false)
    }
  }

  // ── Экспорт ───────────────────────────────────────────────
  const exportGraph = async () => {
    const el = document.querySelector('.react-flow__viewport')
    if (!el) return
    try {
      const url = await toPng(el, { backgroundColor: '#0f0f23', quality: 1, pixelRatio: 2 })
      const a = document.createElement('a')
      a.download = `mindnet-${new Date().toISOString().slice(0, 10)}.png`
      a.href = url
      a.click()
      notify('Граф сохранён!')
    } catch {
      notify('Ошибка экспорта', false)
    }
  }

  // ── Очистить ──────────────────────────────────────────────
  const clearBoard = async () => {
    if (!window.confirm('Удалить ВСЕ узлы и связи?')) return
    setLoading(true)
    try {
      await api.clearAll()
      setNodes([])
      setEdges([])
      setProject(null)
      setRecommendations([])
      setShowPanel(false)
      setNodeCount(0)
      notify('Доска очищена!')
    } catch (err) {
      notify(err.message, false)
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────
  //  РЕНДЕР
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#0f0f23', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ── Уведомление ── */}
      {notification && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background:   notification.ok ? '#052e16' : '#450a0a',
          border:       `1px solid ${notification.ok ? '#4ade80' : '#ef4444'}`,
          color:        notification.ok ? '#4ade80' : '#ef4444',
          padding:      '10px 18px', borderRadius: 10, fontWeight: 600, fontSize: 13,
          boxShadow:    '0 4px 20px rgba(0,0,0,0.5)',
          animation:    'fadeIn .25s ease',
        }}>
          {notification.text}
        </div>
      )}

      {/* ── Левый сайдбар ── */}
      <div style={{
        width:      sidebarOpen ? 280 : 52,
        minWidth:   sidebarOpen ? 280 : 52,
        height:     '100vh',
        background: '#0a0a1a',
        borderRight:'1px solid rgba(255,255,255,0.06)',
        display:    'flex',
        flexDirection: 'column',
        transition: 'width .2s, min-width .2s',
        overflow:   'hidden',
        zIndex:     100,
      }}>

        {/* Шапка */}
        <div style={{
          padding:    '16px 12px',
          display:    'flex',
          alignItems: 'center',
          justifyContent: sidebarOpen ? 'space-between' : 'center',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          {sidebarOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🧠</span>
              <span style={{ fontWeight: 800, color: '#a78bfa', fontSize: 15, letterSpacing: '-0.3px' }}>MindNet AI</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, padding: 2 }}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {sidebarOpen && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>

            {/* Статус БД */}
            <div style={{ padding: '6px 16px', marginBottom: 4 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: dbStatus === null ? '#64748b' : dbStatus ? '#4ade80' : '#ef4444',
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: dbStatus === null ? '#64748b' : dbStatus ? '#4ade80' : '#ef4444',
                  flexShrink: 0,
                }} />
                {dbStatus === null ? 'Проверка...' : dbStatus ? `Neo4j подключён · ${nodeCount} узлов` : 'Neo4j недоступен'}
              </div>
            </div>

            {/* Секция: Добавить навык */}
            <Section title="Добавить навык">
              <input
                value={newNodeTitle}
                onChange={e => setNewNodeTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNode()}
                placeholder="Название навыка"
                style={iStyle}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <select value={newNodeType} onChange={e => setNewNodeType(e.target.value)} style={{ ...iStyle, flex: 1 }}>
                  {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                </select>
                <select value={newNodeLevel} onChange={e => setNewNodeLevel(Number(e.target.value))} style={{ ...iStyle, width: 56 }}>
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>L{l}</option>)}
                </select>
              </div>
              <SBtn onClick={addNode} color="#6c63ff" style={{ marginTop: 6, width: '100%' }}>
                + Добавить
              </SBtn>
            </Section>

            {/* Секция: AI Анализ */}
            <Section title="AI Анализ">
              <textarea
                value={descriptionText}
                onChange={e => setDescriptionText(e.target.value)}
                placeholder="Опиши проект или технологии — AI извлечёт навыки..."
                disabled={addingFromText}
                rows={3}
                style={{ ...iStyle, resize: 'none', width: '100%', boxSizing: 'border-box' }}
              />
              <SBtn
                onClick={addSkillsFromDescription}
                disabled={addingFromText}
                color="#9333ea"
                style={{ marginTop: 6, width: '100%' }}
              >
                {addingFromText ? '⏳ Анализирую...' : '✨ Извлечь навыки'}
              </SBtn>
            </Section>

            {/* Секция: Поиск и фильтры */}
            <Section title="Фильтры">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 Поиск..."
                style={iStyle}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {[0,1,2,3,4,5].map(l => (
                  <FilterChip
                    key={l}
                    label={l === 0 ? 'Все' : `L${l}`}
                    active={filterLevel === l}
                    color={l === 0 ? '#64748b' : (LEVEL_COLORS[l]?.border || '#64748b')}
                    onClick={() => setFilterLevel(l)}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                <FilterChip label="Все" active={activeCategory === 'all'} color="#64748b" onClick={() => setActiveCategory('all')} />
                {TYPE_ORDER.map(t => (
                  <FilterChip
                    key={t}
                    label={TYPE_ICONS[t]}
                    active={activeCategory === t}
                    color="#a78bfa"
                    title={t}
                    onClick={() => setActiveCategory(t)}
                  />
                ))}
              </div>
              {(searchQuery || filterLevel > 0 || activeCategory !== 'all') && (
                <SBtn
                  onClick={() => { setSearchQuery(''); setFilterLevel(0); setActiveCategory('all') }}
                  color="#64748b"
                  style={{ marginTop: 6, width: '100%', fontSize: 11 }}
                >
                  Сбросить фильтры
                </SBtn>
              )}
            </Section>

            {/* Секция: AI Инструменты */}
            <Section title="AI Инструменты">
              <SBtn onClick={suggestConnections} disabled={loading} color="#f59e0b" style={{ width: '100%', marginBottom: 6 }}>
                🔗 Авто-связи
              </SBtn>
              <SBtn onClick={generateProject}    disabled={loading} color="#10b981" style={{ width: '100%', marginBottom: 6 }}>
                🎯 Генерировать проект
              </SBtn>
              <SBtn onClick={loadRecommendations} color="#3b82f6" style={{ width: '100%' }}>
                💡 Рекомендации
              </SBtn>
            </Section>

            {/* Секция: Действия */}
            <Section title="Действия">
              <SBtn onClick={exportGraph} color="#0891b2" style={{ width: '100%', marginBottom: 6 }}>
                📸 Экспорт PNG
              </SBtn>
              <SBtn onClick={clearBoard} disabled={loading} color="#dc2626" style={{ width: '100%' }}>
                🗑️ Очистить всё
              </SBtn>
            </Section>

            {loading && (
              <div style={{ padding: '8px 16px', color: '#a78bfa', fontSize: 12, textAlign: 'center' }}>
                ⏳ Загрузка...
              </div>
            )}

          </div>
        )}

        {/* Кнопка чата снизу */}
        <div style={{
          padding:     '12px',
          borderTop:   '1px solid rgba(255,255,255,0.06)',
          flexShrink:  0,
        }}>
          <button
            onClick={() => setChatOpen(true)}
            title="Открыть чат с ментором"
            style={{
              width:        '100%',
              padding:      '9px',
              background:   'rgba(239,68,68,0.15)',
              border:       '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              color:        '#f87171',
              fontWeight:   600,
              fontSize:     sidebarOpen ? 13 : 18,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          6,
            }}
          >
            💬 {sidebarOpen && 'Чат с ментором'}
          </button>
        </div>
      </div>

      {/* ── Граф ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.05}
          maxZoom={4}
          deleteKeyCode="Delete"
        >
          <Background color="rgba(167,139,250,0.06)" gap={30} />
          <Controls
            style={{
              background:   'rgba(10,10,26,0.9)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
            }}
          />
          <MiniMap
            nodeColor={n => LEVEL_COLORS[n.data?.level]?.border || '#a78bfa'}
            maskColor="rgba(10,10,26,0.7)"
            style={{
              background:   'rgba(10,10,26,0.9)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
            }}
          />

          {/* Легенда уровней */}
          <Panel position="bottom-left">
            <div style={{
              background:   'rgba(10,10,26,0.85)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding:      '8px 12px',
              display:      'flex',
              gap:          10,
              fontSize:     11,
              color:        '#64748b',
            }}>
              {[1,2,3,4,5].map(l => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: LEVEL_COLORS[l].border }} />
                  <span style={{ color: LEVEL_COLORS[l].border }}>{LEVEL_COLORS[l].label}</span>
                </div>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* ── Чат ── */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}

      {/* ── Боковая панель результатов ── */}
      {showPanel && (
        <div style={{
          position:   'absolute',
          top: 12, right: 12,
          zIndex:     1000,
          width:      340,
          maxHeight:  'calc(100vh - 24px)',
          overflowY:  'auto',
          background: '#0a0a1a',
          border:     '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding:    '20px',
          boxShadow:  '0 8px 32px rgba(0,0,0,0.6)',
          color:      '#e2e8f0',
        }}>
          <button
            onClick={() => setShowPanel(false)}
            style={{
              position: 'absolute', top: 12, right: 14,
              background: 'none', border: 'none',
              color: '#64748b', fontSize: 20, cursor: 'pointer',
            }}
          >×</button>

          {project && (
            <div>
              <h3 style={{ color: '#10b981', marginTop: 0, fontSize: 14, fontWeight: 700 }}>🎯 Проект</h3>
              <h4 style={{ color: '#f1f5f9', margin: '8px 0', fontSize: 15 }}>{project.title}</h4>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{project.description}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                {project.technologies?.map((t, i) => (
                  <span key={i} style={{
                    background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)',
                    borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#a78bfa',
                  }}>{t}</span>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#475569', marginTop: 10 }}>
                ⏱ ~{project.estimated_hours} ч · {project.difficulty}
              </p>
              {project.learning_goals?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 10, marginBottom: 4 }}>Цели обучения:</div>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    {project.learning_goals.map((g, i) => (
                      <li key={i} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {recommendations.length > 0 && (
            <div>
              <h3 style={{ color: '#3b82f6', marginTop: 0, fontSize: 14, fontWeight: 700 }}>💡 Рекомендации</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recommendations.map((r, i) => (
                  <div key={i} style={{
                    padding: '8px 12px',
                    background: 'rgba(59,130,246,0.08)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#93c5fd',
                  }}>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .react-flow__node { transition: opacity .2s; }
        .react-flow__controls-button { background: transparent !important; border-color: rgba(255,255,255,0.1) !important; color: #94a3b8 !important; }
        .react-flow__controls-button:hover { background: rgba(255,255,255,0.05) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        textarea::placeholder, input::placeholder { color: #475569 !important; }
      `}</style>
    </div>
  )
}

// ─── Вспомогательные компоненты ───────────────────────────────

const Section = ({ title, children }) => {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '8px 0' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none',
          padding: '4px 16px 6px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: '#334155' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 8px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

const iStyle = {
  width:        '100%',
  padding:      '7px 10px',
  borderRadius: 7,
  border:       '1px solid rgba(255,255,255,0.08)',
  background:   'rgba(255,255,255,0.04)',
  color:        '#e2e8f0',
  fontSize:     12,
  outline:      'none',
  boxSizing:    'border-box',
}

const SBtn = ({ onClick, color, children, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding:      '8px 12px',
      background:   disabled ? 'rgba(255,255,255,0.04)' : `${color}22`,
      border:       `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : color + '55'}`,
      borderRadius: 7,
      color:        disabled ? '#475569' : color,
      fontWeight:   600,
      fontSize:     12,
      cursor:       disabled ? 'not-allowed' : 'pointer',
      transition:   'all .15s',
      ...style,
    }}
  >
    {children}
  </button>
)

const FilterChip = ({ label, active, color, onClick, title }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      padding:    '3px 9px',
      background: active ? `${color}22` : 'transparent',
      border:     `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 20,
      color:      active ? color : '#475569',
      fontSize:   11,
      cursor:     'pointer',
      transition: 'all .15s',
    }}
  >
    {label}
  </button>
)

export default GraphCanvas
