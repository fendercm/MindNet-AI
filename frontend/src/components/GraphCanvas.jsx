// frontend/src/components/GraphCanvas.jsx
import ChatPanel from './ChatPanel'
import React, { useCallback, useState, useEffect, useMemo } from 'react'
import ReactFlow, {
  addEdge, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType, Handle, Position, Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api/client'
import { toPng } from 'html-to-image'

// ─── Tokens ───────────────────────────────────────────────────
const BG = '#080818'

const CAT = {
  language:  { color: '#38bdf8', icon: '⌨',  label: 'Language'  },
  framework: { color: '#f472b6', icon: '⚡',  label: 'Framework' },
  library:   { color: '#c084fc', icon: '📦', label: 'Library'   },
  database:  { color: '#fbbf24', icon: '🗄',  label: 'Database'  },
  tool:      { color: '#34d399', icon: '🔧', label: 'Tool'      },
  math:      { color: '#fb923c', icon: '📐', label: 'Math'      },
  concept:   { color: '#818cf8', icon: '💡', label: 'Concept'   },
  skill:     { color: '#e879f9', icon: '🧠', label: 'Skill'     },
}
const CAT_ORDER = ['language','framework','library','database','tool','math','concept','skill']
const EDGE_COLORS = {
  requires: '#f472b6', extends: '#38bdf8', complements: '#34d399',
  used_with: '#fbbf24', related_to: '#334155',
}
const LEVELS = ['','Новичок','Базовый','Средний','Продвинутый','Эксперт']

// ─── Layout ───────────────────────────────────────────────────
const applyLayout = (nodes) => {
  if (!nodes.length) return nodes
  const groups = {}
  CAT_ORDER.forEach(t => { groups[t] = [] })
  nodes.forEach(n => {
    const t = n.data.node_type || 'skill'
    if (!groups[t]) groups[t] = []
    groups[t].push(n)
  })
  const filled = CAT_ORDER.filter(t => groups[t].length)
  const NW = 172, NH = 86, PX = 18, PY = 16, GX = 80
  const result = []; let cx = 0
  filled.forEach(type => {
    const g = groups[type]
    const cols = Math.max(1, Math.ceil(Math.sqrt(g.length * 1.4)))
    const gw = cols * (NW + PX) - PX + 40
    g.forEach((node, i) => result.push({
      ...node,
      position: { x: cx + 20 + (i % cols) * (NW + PX), y: 40 + Math.floor(i / cols) * (NH + PY) },
    }))
    cx += gw + GX
  })
  return result
}

const parseNode = (n) => {
  let level = parseInt(n.level) || 1
  let node_type = (n.node_type || 'skill').toLowerCase()
  if ((!n.level || n.level === 1) && n.description) {
    const m = n.description.match(/Level\s*(\d+)/i); if (m) level = parseInt(m[1])
    const c = n.description.match(/^(language|framework|library|database|tool|concept)/i)
    if (c) node_type = c[1].toLowerCase()
  }
  return { level: Math.min(Math.max(level, 1), 5), node_type: CAT_ORDER.includes(node_type) ? node_type : 'skill' }
}

// ─── SkillNode — NO useState, CSS-only hover ──────────────────
const SkillNode = ({ data, selected }) => {
  const { level, node_type, title } = data
  const cat = CAT[node_type] || CAT.skill

  return (
    <div className={`sn${selected ? ' sn--sel' : ''}`} style={{ '--c': cat.color }}>
      {/* Top accent line */}
      <div className="sn__line" />
      {/* Ambient blob */}
      <div className="sn__blob" />

      <Handle type="target"   position={Position.Left}  className="sn__handle" style={{ left: -5 }} />
      <Handle type="source" position={Position.Right} className="sn__handle" style={{ right: -5 }} />

      {/* Category row */}
      <div className="sn__cat">
        <span className="sn__icon">{cat.icon}</span>
        <span className="sn__cat-label">{cat.label}</span>
        <span className="sn__level-badge">L{level}</span>
      </div>

      {/* Title */}
      <div className="sn__title">{title}</div>

      {/* Level bar */}
      <div className="sn__bar-track">
        {[1,2,3,4,5].map(i => (
          <div key={i} className={`sn__bar-seg${i <= level ? ' sn__bar-seg--on' : ''}`} />
        ))}
      </div>
    </div>
  )
}

const nodeTypes = { skill: SkillNode }

// ─── GraphCanvas ──────────────────────────────────────────────
const GraphCanvas = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [newTitle,    setNewTitle]    = useState('')
  const [newType,     setNewType]     = useState('skill')
  const [newLevel,    setNewLevel]    = useState(1)
  const [aiText,      setAiText]      = useState('')
  const [analyzing,   setAnalyzing]   = useState(false)
  const [chatOpen,    setChatOpen]    = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterLvl,   setFilterLvl]   = useState(0)
  const [filterCat,   setFilterCat]   = useState('all')
  const [loading,     setLoading]     = useState(false)
  const [project,     setProject]     = useState(null)
  const [recs,        setRecs]        = useState([])
  const [showPanel,   setShowPanel]   = useState(false)
  const [notif,       setNotif]       = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dbStatus,    setDbStatus]    = useState(null)
  const [nodeCount,   setNodeCount]   = useState(0)
  const [aiPreview,   setAiPreview]   = useState(null)

  useEffect(() => { loadGraph(); checkHealth() }, [])

  const checkHealth = async () => {
    try { const d = await (await fetch('http://localhost:8000/health')).json(); setDbStatus(d.neo4j) }
    catch { setDbStatus(false) }
  }

  const notify = (text, ok = true) => {
    setNotif({ text, ok })
    setTimeout(() => setNotif(null), 3500)
  }

  const loadGraph = async () => {
    try {
      const data = await api.getGraph()
      const fn = (data.nodes || []).map(n => {
        const { level, node_type } = parseNode(n)
        return { id: String(n.id), type: 'skill', position: { x: 0, y: 0 }, data: { label: n.title, title: n.title, level, node_type } }
      })
      const fe = (data.edges || []).map(e => {
        const c = EDGE_COLORS[e.relation_type] || EDGE_COLORS.related_to
        return {
          id: e.id || `${e.from}-${e.to}`, source: String(e.from), target: String(e.to),
          label: e.relation_type || '', type: 'smoothstep',
          animated: e.relation_type === 'requires',
          style: { stroke: c, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: c, width: 12, height: 12 },
          labelStyle: { fontSize: 9, fontWeight: 700, fill: c },
          labelBgPadding: [3, 2], labelBgBorderRadius: 4,
          labelBgStyle: { fill: BG, fillOpacity: 0.95 },
        }
      })
      const positioned = applyLayout(fn)
      setNodes(positioned); setEdges(fe); setNodeCount(positioned.length)
    } catch { notify('Ошибка загрузки', false) }
  }

  const filteredNodes = useMemo(() => nodes.map(n => ({
    ...n,
    hidden:
      (search && !n.data.title.toLowerCase().includes(search.toLowerCase())) ||
      (filterLvl > 0 && n.data.level !== filterLvl) ||
      (filterCat !== 'all' && n.data.node_type !== filterCat),
  })), [nodes, search, filterLvl, filterCat])

  const onConnect = useCallback((p) => {
    const c = EDGE_COLORS.related_to
    api.createEdge({ from_node: p.source, to_node: p.target, relation_type: 'related_to' })
    setEdges(eds => addEdge({ ...p, type: 'smoothstep', style: { stroke: c, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: c } }, eds))
  }, [setEdges])

  const addNode = async () => {
    if (!newTitle.trim()) return
    try {
      await api.createNode({ title: newTitle.trim(), description: '', node_type: newType, level: newLevel })
      await loadGraph(); setNewTitle(''); notify(`✓ Добавлен: ${newTitle}`)
    } catch { notify('Ошибка добавления', false) }
  }

  const addSkills = async () => {
    if (!aiText.trim()) return
    setAnalyzing(true); setAiPreview(null)
    try {
      const res = await (await fetch('http://localhost:8000/ai/add-skills/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText }),
      })).json()
      if (res.error) { notify(res.error, false); return }
      if (!res.neo4j_available) {
        setAiPreview({ skills: res.ai_skills || [], gaps: res.gaps || [] })
        notify(`AI нашёл ${res.ai_skills?.length || 0} навыков — Neo4j недоступен`, false)
        return
      }
      await loadGraph(); setAiText(''); notify(`✓ Добавлено ${res.skills?.length || 0} навыков`)
    } catch (e) { notify(e.message, false)
    } finally { setAnalyzing(false) }
  }

  const suggestLinks = async () => {
    setLoading(true)
    try {
      const r = await (await fetch('http://localhost:8000/ai/suggest-connections/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      })).json()
      if (r.error) { notify(r.error, false); return }
      await loadGraph(); notify(`✓ Создано ${r.created || 0} связей`)
    } catch (e) { notify(e.message, false)
    } finally { setLoading(false) }
  }

  const genProject = async () => {
    setLoading(true)
    try { const r = await api.generateProject(); setProject(r); setRecs([]); setShowPanel(true); notify('✓ Проект готов') }
    catch (e) { notify(e.message, false)
    } finally { setLoading(false) }
  }

  const loadRecs = async () => {
    try { const r = await api.getRecommendations(); setRecs(r.recommendations || []); setProject(null); setShowPanel(true); notify('✓ Рекомендации готовы') }
    catch (e) { notify(e.message, false) }
  }

  const exportPng = async () => {
    const el = document.querySelector('.react-flow__viewport'); if (!el) return
    try {
      const url = await toPng(el, { backgroundColor: BG, quality: 1, pixelRatio: 2 })
      Object.assign(document.createElement('a'), { download: `mindnet-${new Date().toISOString().slice(0,10)}.png`, href: url }).click()
      notify('✓ Сохранено')
    } catch { notify('Ошибка', false) }
  }

  const clearAll = async () => {
    if (!window.confirm('Удалить все данные?')) return
    setLoading(true)
    try {
      await api.clearAll(); setNodes([]); setEdges([]); setProject(null)
      setRecs([]); setShowPanel(false); setNodeCount(0); notify('✓ Очищено')
    } catch (e) { notify(e.message, false)
    } finally { setLoading(false) }
  }

  const SIDEBAR_W = 276

  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflow: 'hidden' }}>

      {/* ── Background mesh ── */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30%', left: '-20%', width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(circle, rgba(88,28,220,0.10) 0%, transparent 60%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '-25%', right: '-15%', width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,180,0.07) 0%, transparent 60%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', top: '30%', right: '25%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(219,39,119,0.05) 0%, transparent 65%)', filter: 'blur(50px)' }} />
      </div>

      {/* ── Sidebar ── */}
      <aside style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 100,
        width: sidebarOpen ? SIDEBAR_W : 0,
        overflow: 'hidden',
        transition: 'width .28s cubic-bezier(.4,0,.2,1)',
        pointerEvents: sidebarOpen ? 'auto' : 'none',
      }}>
        <div className="sidebar">

          {/* Header */}
          <div className="sidebar__head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="logo-badge">🧠</div>
              <div>
                <div className="logo-name">MindNet AI</div>
                <div className={`db-pill db-pill--${dbStatus === null ? 'wait' : dbStatus ? 'ok' : 'err'}`}>
                  <span className="db-dot" />
                  {dbStatus === null ? 'Соединение...' : dbStatus ? `Neo4j · ${nodeCount} навыков` : 'Neo4j недоступен'}
                </div>
              </div>
            </div>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)} title="Свернуть">‹</button>
          </div>

          <div className="sidebar__body">

            {/* ── Add skill ── */}
            <section className="card">
              <div className="card__title">Добавить навык</div>
              <input
                className="field"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNode()}
                placeholder="Название: Python, Docker, Матанализ..."
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <select className="field" style={{ flex: 1 }} value={newType} onChange={e => setNewType(e.target.value)}>
                  {CAT_ORDER.map(t => <option key={t} value={t}>{CAT[t].icon} {CAT[t].label}</option>)}
                </select>
                <select className="field" style={{ width: 68 }} value={newLevel} onChange={e => setNewLevel(Number(e.target.value))}>
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>L{l}</option>)}
                </select>
              </div>
              {/* Live preview */}
              <div className="level-preview" style={{ '--c': CAT[newType]?.color || '#a78bfa' }}>
                <span className="level-preview__icon">{CAT[newType]?.icon}</span>
                <span className="level-preview__cat">{CAT[newType]?.label}</span>
                <div className="level-preview__bars">
                  {[1,2,3,4,5].map(i => <div key={i} className={`lp-bar${i <= newLevel ? ' lp-bar--on' : ''}`} />)}
                </div>
                <span className="level-preview__lbl">{LEVELS[newLevel]}</span>
              </div>
              <button className="btn btn--primary" onClick={addNode}>＋ Добавить</button>
            </section>

            <div className="divider" />

            {/* ── AI analysis ── */}
            <section className="card">
              <div className="card__title">AI Анализ навыков</div>
              <textarea
                className="field"
                rows={4}
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                placeholder="Опиши свой опыт или стек — AI сам извлечёт навыки и уровень..."
                disabled={analyzing}
                style={{ resize: 'vertical', lineHeight: 1.6 }}
              />
              <button className="btn btn--ai" onClick={addSkills} disabled={analyzing}>
                {analyzing ? <><span className="spinner" /> Анализирую...</> : <>✦ Извлечь навыки AI</>}
              </button>
            </section>

            <div className="divider" />

            {/* ── AI Tools ── */}
            <section className="card">
              <div className="card__title">AI Инструменты</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="btn btn--tool" style={{ '--tc': '#fbbf24' }} onClick={suggestLinks}  disabled={loading}>⟡ Авто-связи</button>
                <button className="btn btn--tool" style={{ '--tc': '#34d399' }} onClick={genProject}    disabled={loading}>◈ Генерировать проект</button>
                <button className="btn btn--tool" style={{ '--tc': '#818cf8' }} onClick={loadRecs}>◉ Рекомендации</button>
              </div>
            </section>

            <div className="divider" />

            {/* ── Filters ── */}
            <section className="card">
              <div className="card__title">Фильтры</div>
              <input className="field" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск по названию..." />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {[0,1,2,3,4,5].map(l => (
                  <button key={l} className={`chip${filterLvl === l ? ' chip--on' : ''}`} style={{ '--cc': '#a78bfa' }} onClick={() => setFilterLvl(l)}>
                    {l === 0 ? 'Все уровни' : `L${l}`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                <button className={`chip${filterCat === 'all' ? ' chip--on' : ''}`} style={{ '--cc': '#94a3b8' }} onClick={() => setFilterCat('all')}>Все</button>
                {CAT_ORDER.map(t => (
                  <button key={t} className={`chip${filterCat === t ? ' chip--on' : ''}`} style={{ '--cc': CAT[t].color }} onClick={() => setFilterCat(t)}>
                    {CAT[t].icon}
                  </button>
                ))}
              </div>
              {(search || filterLvl > 0 || filterCat !== 'all') && (
                <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={() => { setSearch(''); setFilterLvl(0); setFilterCat('all') }}>
                  ↺ Сбросить фильтры
                </button>
              )}
            </section>

            <div className="divider" />

            {/* ── Actions ── */}
            <section className="card">
              <div className="card__title">Действия</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--ghost" style={{ flex: 1 }} onClick={exportPng}>⬇ PNG</button>
                <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => { loadGraph(); notify('✓ Обновлено') }}>↻ Обновить</button>
              </div>
              <button className="btn btn--danger" style={{ marginTop: 8 }} onClick={clearAll} disabled={loading}>✕ Очистить всё</button>
            </section>

          </div>

          {/* Chat button */}
          <div className="sidebar__foot">
            <button className="chat-btn" onClick={() => setChatOpen(true)}>
              <span style={{ fontSize: 17 }}>💬</span> Чат с ментором
            </button>
          </div>
        </div>
      </aside>

      {/* ── Sidebar toggle (when closed) ── */}
      {!sidebarOpen && (
        <button
          className="open-btn"
          onClick={() => setSidebarOpen(true)}
          title="Открыть панель"
        >
          🧠
        </button>
      )}

      {/* ── Graph — takes remaining space ── */}
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0,
        left: sidebarOpen ? SIDEBAR_W : 0,
        right: 0,
        transition: 'left .28s cubic-bezier(.4,0,.2,1)',
        zIndex: 1,
      }}>
        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.04}
          maxZoom={5}
          deleteKeyCode="Delete"
          style={{ width: '100%', height: '100%' }}
        >
          <Background color="rgba(148,163,184,0.035)" gap={32} size={1} />
          <Controls
            style={{
              background: 'rgba(8,8,24,0.8)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}
          />
          <MiniMap
            nodeColor={n => CAT[n.data?.node_type]?.color || '#818cf8'}
            maskColor="rgba(8,8,24,0.8)"
            style={{
              background: 'rgba(8,8,24,0.8)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}
          />
          <Panel position="bottom-center">
            <div className="legend">
              {[1,2,3,4,5].map(l => (
                <div key={l} className="legend__item">
                  <span className="legend__dot" style={{ background: `hsl(${195 + l * 38},80%,62%)`, boxShadow: `0 0 6px hsl(${195 + l * 38},80%,62%)` }} />
                  <span>{LEVELS[l]}</span>
                </div>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* ── Notification ── */}
      {notif && (
        <div className={`notif notif--${notif.ok ? 'ok' : 'err'}`}>
          {notif.text}
        </div>
      )}

      {/* ── Result panel ── */}
      {showPanel && (
        <div className="result-panel">
          <button className="result-panel__close" onClick={() => setShowPanel(false)}>×</button>
          {project && (
            <>
              <div className="rp-header" style={{ color: '#6ee7b7' }}>
                <span>🎯</span> Рекомендованный проект
              </div>
              <div className="rp-title">{project.title}</div>
              <p className="rp-desc">{project.description}</p>
              <div className="rp-tags">
                {project.technologies?.map((t, i) => <span key={i} className="tag tag--green">{t}</span>)}
              </div>
              <div className="rp-meta">⏱ ~{project.estimated_hours} ч · {project.difficulty}</div>
              {project.learning_goals?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="rp-sublabel">Цели обучения</div>
                  {project.learning_goals.map((g, i) => <div key={i} className="rp-goal">› {g}</div>)}
                </div>
              )}
            </>
          )}
          {recs.length > 0 && (
            <>
              <div className="rp-header" style={{ color: '#a5b4fc' }}>
                <span>💡</span> Что изучить дальше
              </div>
              {recs.map((r, i) => (
                <div key={i} className="rec-item">
                  <span className="rec-num">{String(i + 1).padStart(2, '0')}</span>
                  {r}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── AI Preview panel ── */}
      {aiPreview && (
        <div className="result-panel result-panel--warn">
          <button className="result-panel__close" onClick={() => setAiPreview(null)}>×</button>
          <div className="rp-header" style={{ color: '#fde68a' }}>
            <span>⚠️</span> Neo4j не запущен
          </div>
          <p className="rp-desc">AI нашёл {aiPreview.skills.length} навыков, но граф не обновлён</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
            {aiPreview.skills.map((s, i) => {
              const c = CAT[s.category] || CAT.skill
              return (
                <div key={i} className="ai-skill-row" style={{ '--c': c.color }}>
                  <span>{c.icon}</span>
                  <span className="ai-skill-name">{s.name}</span>
                  <div className="ai-skill-bars">
                    {[1,2,3,4,5].map(j => <div key={j} className={`aib${j <= (s.level||1) ? ' aib--on' : ''}`} />)}
                  </div>
                  <span className="ai-skill-lvl">L{s.level||1}</span>
                </div>
              )
            })}
          </div>
          <div className="warn-box">
            Запусти Neo4j Desktop → <strong>Start</strong> → добавь навыки снова
          </div>
        </div>
      )}

      {/* ── Chat ── */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}

      {/* ── Global styles ── */}
      <style>{`
        /* ── Reset & base ── */
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Sidebar ── */
        .sidebar {
          width: 276px; height: 100%;
          display: flex; flex-direction: column;
          background: rgba(8,8,24,0.72);
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border-right: 1px solid rgba(255,255,255,0.07);
          box-shadow: 4px 0 48px rgba(0,0,0,0.5), inset -1px 0 0 rgba(255,255,255,0.04);
        }
        .sidebar__head {
          flex-shrink: 0;
          padding: 16px 14px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; justify-content: space-between;
        }
        .sidebar__body {
          flex: 1; overflow-y: auto; padding: 12px 12px 4px;
        }
        .sidebar__body::-webkit-scrollbar { width: 3px; }
        .sidebar__body::-webkit-scrollbar-track { background: transparent; }
        .sidebar__body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .sidebar__foot {
          flex-shrink: 0; padding: 12px 12px 14px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        /* ── Logo ── */
        .logo-badge {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          background: linear-gradient(135deg, #6d28d9 0%, #0ea5e9 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 17px;
          box-shadow: 0 0 20px rgba(109,40,217,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .logo-name {
          font-weight: 800; font-size: 14px; letter-spacing: -0.5px;
          background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(148,163,184,0.7));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          line-height: 1.2; margin-bottom: 2px;
        }
        .db-pill {
          display: flex; align-items: center; gap: 5px;
          font-size: 10px; font-weight: 600; letter-spacing: 0.1px;
        }
        .db-pill--ok  { color: #34d399; }
        .db-pill--err { color: #f87171; }
        .db-pill--wait{ color: #64748b; }
        .db-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor; flex-shrink: 0;
        }
        .db-pill--ok .db-dot { box-shadow: 0 0 6px currentColor; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        /* ── Card sections ── */
        .card { padding: 2px 0 6px; }
        .card__title {
          font-size: 10px; font-weight: 700; letter-spacing: 0.7px;
          text-transform: uppercase; color: rgba(255,255,255,0.22);
          margin-bottom: 10px;
        }
        .divider {
          height: 1px; margin: 8px 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
        }

        /* ── Fields ── */
        .field {
          width: 100%; padding: 8px 11px; border-radius: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.88); font-size: 12.5px;
          outline: none; font-family: inherit;
          box-shadow: inset 0 1px 4px rgba(0,0,0,0.3);
          transition: border-color .15s, box-shadow .15s;
        }
        .field:focus {
          border-color: rgba(109,40,217,0.5);
          box-shadow: inset 0 1px 4px rgba(0,0,0,0.3), 0 0 0 3px rgba(109,40,217,0.12);
        }
        .field::placeholder { color: rgba(255,255,255,0.2); }
        textarea.field { resize: vertical; line-height: 1.6; }
        select.field { appearance: none; cursor: pointer; padding-right: 28px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 9px center;
        }

        /* ── Level preview ── */
        .level-preview {
          margin-top: 8px; padding: 9px 11px; border-radius: 10px;
          background: rgba(var(--c-rgb, 109,40,217), 0.06);
          border: 1px solid color-mix(in srgb, var(--c) 25%, transparent);
          display: flex; align-items: center; gap: 8;
        }
        .level-preview { background: color-mix(in srgb, var(--c) 8%, transparent); border: 1px solid color-mix(in srgb, var(--c) 22%, transparent); }
        .level-preview__icon { font-size: 13px; }
        .level-preview__cat { font-size: 9.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--c); font-family: monospace; }
        .level-preview__bars { display: flex; gap: 3px; flex: 1; }
        .lp-bar { flex: 1; height: 3px; border-radius: 3px; background: rgba(255,255,255,0.08); transition: background .2s; }
        .lp-bar--on { background: var(--c); box-shadow: 0 0 6px color-mix(in srgb, var(--c) 60%, transparent); }
        .level-preview__lbl { font-size: 10px; color: rgba(255,255,255,0.35); white-space: nowrap; }

        /* ── Buttons ── */
        .btn {
          width: 100%; padding: 9px 12px; border-radius: 10px;
          font-size: 12.5px; font-weight: 700; cursor: pointer;
          border: none; outline: none; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          transition: transform .15s, opacity .15s, background .15s;
        }
        .btn:active { transform: scale(0.98); }
        .btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .btn--primary {
          margin-top: 10px;
          background: linear-gradient(135deg, rgba(109,40,217,0.7), rgba(14,165,233,0.5));
          color: rgba(255,255,255,0.92);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 4px 24px rgba(109,40,217,0.25), inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .btn--primary:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(109,40,217,0.85), rgba(14,165,233,0.65));
          box-shadow: 0 6px 32px rgba(109,40,217,0.4), inset 0 1px 0 rgba(255,255,255,0.15);
          transform: translateY(-1px);
        }

        .btn--ai {
          margin-top: 8px;
          background: linear-gradient(135deg, rgba(244,114,182,0.18), rgba(168,85,247,0.14));
          color: #f9a8d4;
          border: 1px solid rgba(244,114,182,0.22);
          box-shadow: 0 0 24px rgba(244,114,182,0.08), inset 0 1px 0 rgba(255,255,255,0.07);
        }
        .btn--ai:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(244,114,182,0.28), rgba(168,85,247,0.22));
          transform: translateY(-1px);
        }

        .btn--tool {
          background: color-mix(in srgb, var(--tc) 10%, transparent);
          color: var(--tc);
          border: 1px solid color-mix(in srgb, var(--tc) 28%, transparent);
          box-shadow: 0 0 16px color-mix(in srgb, var(--tc) 8%, transparent);
        }
        .btn--tool:hover:not(:disabled) {
          background: color-mix(in srgb, var(--tc) 18%, transparent);
          transform: translateY(-1px);
          box-shadow: 0 4px 24px color-mix(in srgb, var(--tc) 20%, transparent);
        }

        .btn--ghost {
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.45);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .btn--ghost:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); transform: translateY(-1px); }

        .btn--danger {
          background: rgba(239,68,68,0.08);
          color: #f87171;
          border: 1px solid rgba(239,68,68,0.18);
        }
        .btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.14); transform: translateY(-1px); }

        /* ── Chips ── */
        .chip {
          padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
          cursor: pointer; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.3);
          transition: all .15s;
        }
        .chip--on {
          background: color-mix(in srgb, var(--cc) 15%, transparent);
          border-color: color-mix(in srgb, var(--cc) 40%, transparent);
          color: var(--cc);
          box-shadow: 0 0 12px color-mix(in srgb, var(--cc) 15%, transparent);
        }
        .chip:hover:not(.chip--on) { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.55); }

        /* ── Icon button ── */
        .icon-btn {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.4); cursor: pointer; font-size: 18px;
          display: flex; align-items: center; justify-content: center;
          transition: all .15s;
        }
        .icon-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.7); }

        /* ── Open button ── */
        .open-btn {
          position: absolute; top: 14px; left: 14px; z-index: 200;
          width: 40px; height: 40px; border-radius: 12px;
          background: rgba(8,8,24,0.8);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.75); cursor: pointer; font-size: 18px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
          transition: all .2s;
        }
        .open-btn:hover { background: rgba(255,255,255,0.1); transform: scale(1.08); }

        /* ── Chat button ── */
        .chat-btn {
          width: 100%; padding: 11px; border-radius: 12px;
          background: linear-gradient(135deg, rgba(244,114,182,0.12), rgba(168,85,247,0.1));
          border: 1px solid rgba(244,114,182,0.2);
          color: #f9a8d4; font-weight: 700; font-size: 13px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 0 28px rgba(244,114,182,0.08), inset 0 1px 0 rgba(255,255,255,0.08);
          transition: all .2s; font-family: inherit;
        }
        .chat-btn:hover { background: linear-gradient(135deg, rgba(244,114,182,0.2), rgba(168,85,247,0.17)); transform: translateY(-1px); box-shadow: 0 6px 32px rgba(244,114,182,0.15); }

        /* ── Skill node (CSS-only hover, no React state) ── */
        .sn {
          position: relative; min-width: 155px; max-width: 175px;
          border-radius: 16px; padding: 11px 13px 13px;
          cursor: grab; user-select: none; overflow: hidden;
          background: linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow:
            0 4px 24px rgba(0,0,0,0.45),
            0 0 28px color-mix(in srgb, var(--c) 8%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.1);
          transition: transform .18s cubic-bezier(.4,0,.2,1), box-shadow .18s cubic-bezier(.4,0,.2,1), border-color .18s;
        }
        .sn:hover {
          transform: translateY(-3px) scale(1.02);
          border-color: rgba(255,255,255,0.18);
          box-shadow:
            0 10px 40px rgba(0,0,0,0.55),
            0 0 50px color-mix(in srgb, var(--c) 18%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.16);
        }
        .sn--sel {
          border-color: color-mix(in srgb, var(--c) 70%, transparent) !important;
          box-shadow:
            0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent),
            0 10px 40px rgba(0,0,0,0.55),
            0 0 55px color-mix(in srgb, var(--c) 22%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.18) !important;
          transform: translateY(-2px) scale(1.02);
        }
        .sn__line {
          position: absolute; top: 0; left: 18%; right: 18%; height: 1.5px;
          background: linear-gradient(90deg, transparent, var(--c), transparent);
          opacity: 0.7;
        }
        .sn__blob {
          position: absolute; top: -20px; left: -20px; width: 90px; height: 90px;
          border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--c) 18%, transparent) 0%, transparent 70%);
          pointer-events: none;
        }
        .sn__handle {
          width: 8px !important; height: 8px !important;
          background: var(--c) !important;
          border: 2px solid rgba(8,8,24,0.9) !important;
        }
        .sn__cat {
          position: relative; display: flex; align-items: center; gap: 5px; margin-bottom: 7px;
        }
        .sn__icon {
          width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0;
          background: color-mix(in srgb, var(--c) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
          display: flex; align-items: center; justify-content: center; font-size: 11px;
        }
        .sn__cat-label {
          font-size: 9px; color: var(--c); font-weight: 700;
          letter-spacing: 0.7px; text-transform: uppercase; font-family: monospace;
        }
        .sn__level-badge {
          margin-left: auto; font-size: 9px; font-weight: 800;
          color: var(--c); font-family: monospace; opacity: 0.75;
        }
        .sn__title {
          position: relative; font-weight: 700;
          color: rgba(255,255,255,0.92); font-size: 12.5px;
          line-height: 1.35; word-break: break-word; margin-bottom: 9px;
          letter-spacing: -0.15px;
        }
        .sn__bar-track { display: flex; gap: 3px; position: relative; }
        .sn__bar-seg {
          flex: 1; height: 3px; border-radius: 3px;
          background: rgba(255,255,255,0.08); transition: background .3s;
        }
        .sn__bar-seg--on {
          background: linear-gradient(90deg, color-mix(in srgb, var(--c) 70%, transparent), var(--c));
          box-shadow: 0 0 6px color-mix(in srgb, var(--c) 60%, transparent);
        }

        /* ── ReactFlow overrides ── */
        .react-flow__renderer { z-index: 0; }
        .react-flow__attribution { display: none; }
        .react-flow__controls-button {
          background: rgba(8,8,24,0.85) !important;
          border-color: rgba(255,255,255,0.08) !important;
          color: rgba(255,255,255,0.45) !important;
          transition: all .15s !important;
        }
        .react-flow__controls-button:hover {
          background: rgba(255,255,255,0.08) !important;
          color: rgba(255,255,255,0.85) !important;
        }
        .react-flow__node { transition: opacity .25s ease; }

        /* ── Legend ── */
        .legend {
          display: flex; gap: 14px; align-items: center;
          padding: 7px 14px; border-radius: 12px;
          background: rgba(8,8,24,0.75);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.07);
          box-shadow: 0 4px 20px rgba(0,0,0,0.35);
          font-size: 10.5px; color: rgba(255,255,255,0.35);
        }
        .legend__item { display: flex; align-items: center; gap: 5px; }
        .legend__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        /* ── Notification ── */
        .notif {
          position: fixed; bottom: 28px; right: 24px; z-index: 9999;
          padding: 11px 20px; border-radius: 14px; font-weight: 600; font-size: 13px;
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          animation: slideUp .25s cubic-bezier(.4,0,.2,1);
          background: rgba(8,8,24,0.88);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .notif--ok  { border: 1px solid rgba(52,211,153,0.3); color: #6ee7b7; box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(52,211,153,0.1); }
        .notif--err { border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(239,68,68,0.1); }
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }

        /* ── Spinner ── */
        .spinner {
          display: inline-block; width: 12px; height: 12px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.2); border-top-color: #f9a8d4;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Result panel ── */
        .result-panel {
          position: absolute; top: 16px; right: 16px; z-index: 400;
          width: 340px; max-height: calc(100vh - 32px); overflow-y: auto;
          padding: 20px; border-radius: 18px;
          background: rgba(8,8,24,0.85);
          backdrop-filter: blur(32px); -webkit-backdrop-filter: blur(32px);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 8px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.8);
          animation: slideIn .25s cubic-bezier(.4,0,.2,1);
        }
        .result-panel--warn { border-color: rgba(251,191,36,0.18); box-shadow: 0 8px 48px rgba(0,0,0,0.6), 0 0 40px rgba(251,191,36,0.05); }
        .result-panel::-webkit-scrollbar { width: 3px; }
        .result-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .result-panel__close {
          position: absolute; top: 14px; right: 14px;
          width: 26px; height: 26px; border-radius: 7px;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.4); cursor: pointer; font-size: 17px;
          display: flex; align-items: center; justify-content: center;
          transition: all .15s;
        }
        .result-panel__close:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
        .rp-header { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 13px; margin-bottom: 12px; }
        .rp-title  { font-weight: 700; color: rgba(255,255,255,0.92); font-size: 15px; margin-bottom: 8px; }
        .rp-desc   { font-size: 12px; color: rgba(255,255,255,0.45); line-height: 1.7; margin: 0 0 12px; }
        .rp-tags   { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
        .tag { padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .tag--green { background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); color: #6ee7b7; }
        .rp-meta   { font-size: 11px; color: rgba(255,255,255,0.25); }
        .rp-sublabel { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.2); margin-bottom: 6px; }
        .rp-goal   { font-size: 11px; color: rgba(255,255,255,0.4); padding-left: 12px; position: relative; margin-bottom: 3px; }
        .rp-goal::before { content: '›'; position: absolute; left: 0; color: #34d399; }
        .rec-item  { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; background: rgba(129,140,248,0.06); border: 1px solid rgba(129,140,248,0.12); font-size: 12px; color: rgba(255,255,255,0.65); margin-bottom: 5px; }
        .rec-num   { font-size: 10px; font-weight: 800; font-family: monospace; color: #818cf8; flex-shrink: 0; }

        /* ── AI skill rows ── */
        .ai-skill-row {
          display: flex; align-items: center; gap: 8px; padding: 7px 10px;
          background: color-mix(in srgb, var(--c) 7%, transparent);
          border: 1px solid color-mix(in srgb, var(--c) 20%, transparent);
          border-radius: 9px;
        }
        .ai-skill-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); flex: 1; }
        .ai-skill-bars { display: flex; gap: 2px; width: 50px; }
        .aib { flex: 1; height: 2.5px; border-radius: 2px; background: rgba(255,255,255,0.08); }
        .aib--on { background: var(--c); }
        .ai-skill-lvl { font-size: 9px; font-weight: 700; font-family: monospace; color: var(--c); }
        .warn-box { padding: 10px 12px; background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.14); border-radius: 10px; font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.65; }
        .warn-box strong { color: #fde68a; }

        /* ── Scrollbar global ── */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.13); }
      `}</style>
    </div>
  )
}

export default GraphCanvas
