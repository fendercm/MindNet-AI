// frontend/src/components/GraphCanvas.jsx
import ChatPanel from './ChatPanel'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  addEdge, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, MarkerType, Handle, Position,
  ReactFlowProvider, useStoreApi, useStore,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from '../api/client'
import { toPng } from 'html-to-image'
import {
  BG, CAT, CAT_ORDER, EDGE_COLORS, EDGE_LABELS, LEVELS,
  parseNode, applyLayout, viewportFor,
} from '../lib/graph'

/* ─── Вселенная ─────────────────────────────────────────────── */
const SIDEBAR_W = 292

/* ─── Нода знания ───────────────────────────────────────────── */
const SkillNode = ({ data, selected }) => {
  const cat = CAT[data.node_type] || CAT.skill
  return (
    <div
      className={`kn${selected ? ' kn--sel' : ''}`}
      style={{ '--c-rgb': cat.rgb }}
    >
      <div className="kn__line" />
      <div className="kn__aura" />

      <Handle type="target" position={Position.Left} className="kn__handle" style={{ left: -4 }} />
      <Handle type="source" position={Position.Right} className="kn__handle" style={{ right: -4 }} />

      <div className="kn__cat">
        <span className="kn__icon">{cat.icon}</span>
        <span className="kn__cat-label">{cat.label}</span>
        <span className={`kn__lvl${data.level === 5 ? ' kn__lvl--max' : ''}`}>L{data.level}</span>
      </div>

      <div className="kn__title">{data.title}</div>

      <div className="kn__bars">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`kn__bar${i <= data.level ? ' kn__bar--on' : ''}`} />
        ))}
      </div>
    </div>
  )
}

/* ─── Заголовок созвездия ───────────────────────────────────── */
const GroupLabelNode = ({ data }) => {
  const cat = CAT[data.catType] || CAT.skill
  return (
    <div className="gh" style={{ '--c-rgb': cat.rgb }}>
      <span className="gh__label">{cat.label}</span>
      <span className="gh__rule" />
      <span className="gh__count">{data.count}</span>
    </div>
  )
}

const nodeTypes = { skill: SkillNode, groupLabel: GroupLabelNode }

/* ─── Логотип-глиф ──────────────────────────────────────────── */
const Glyph = ({ id }) => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden>
    <defs>
      <linearGradient id={id} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#22d3ee" />
        <stop offset=".5" stopColor="#8b5cf6" />
        <stop offset="1" stopColor="#f472b6" />
      </linearGradient>
    </defs>
    <g stroke={`url(#${id})`} strokeWidth="2.4" strokeLinejoin="round" opacity=".85">
      <path d="M20 18 L44 24 L46 44 L26 48 Z" />
      <path d="M20 18 L26 48" opacity=".55" />
    </g>
    <g fill={`url(#${id})`}>
      <circle cx="20" cy="18" r="5" />
      <circle cx="44" cy="24" r="4.4" />
      <circle cx="46" cy="44" r="4" />
      <circle cx="26" cy="48" r="5" />
    </g>
  </svg>
)

/* ─── Пустое состояние: созвездие ───────────────────────────── */
const VoidArt = () => (
  <svg className="void__art" viewBox="0 0 240 170" fill="none" aria-hidden>
    <defs>
      <linearGradient id="void-g" x1="20" y1="20" x2="220" y2="150" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#22d3ee" />
        <stop offset=".55" stopColor="#8b5cf6" />
        <stop offset="1" stopColor="#f472b6" />
      </linearGradient>
    </defs>
    <g stroke="url(#void-g)" strokeWidth="1" opacity=".5">
      <path className="void-link" d="M40 110 L92 64 L150 78 L196 42" />
      <path className="void-link" d="M92 64 L74 34" style={{ animationDelay: '-1s' }} />
      <path className="void-link" d="M150 78 L164 126" style={{ animationDelay: '-2s' }} />
      <path className="void-link" d="M40 110 L164 126" style={{ animationDelay: '-0.5s' }} />
    </g>
    {[
      [40, 110, 4], [92, 64, 5.5], [150, 78, 4.5], [196, 42, 5], [74, 34, 3], [164, 126, 4],
    ].map(([x, y, r], i) => (
      <circle
        key={i}
        className="void-star"
        cx={x} cy={y} r={r}
        fill="url(#void-g)"
        style={{ animationDelay: `${i * 0.45}s` }}
      />
    ))}
    <circle cx="92" cy="64" r="11" stroke="#8b5cf6" strokeWidth=".7" opacity=".3" />
    <circle cx="196" cy="42" r="10" stroke="#22d3ee" strokeWidth=".7" opacity=".3" />
  </svg>
)

/* ══════════════════════════════════════════════════════════════
   GraphCanvas
   ══════════════════════════════════════════════════════════════ */
const GraphCanvas = () => {
  const store = useStoreApi()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState('skill')
  const [newLevel, setNewLevel] = useState(1)
  const [aiText, setAiText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filterLvl, setFilterLvl] = useState(0)
  const [filterCat, setFilterCat] = useState('all')
  const [loading, setLoading] = useState(false)
  const [project, setProject] = useState(null)
  const [recs, setRecs] = useState([])
  const [showPanel, setShowPanel] = useState(false)
  const [aiPreview, setAiPreview] = useState(null)
  const [notif, setNotif] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dbStatus, setDbStatus] = useState(null)
  const [nodeCount, setNodeCount] = useState(0)
  const [booting, setBooting] = useState(true)
  const [epoch, setEpoch] = useState(0)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [details, setDetails] = useState(null)
  const [confirmBox, setConfirmBox] = useState(null)

  const searchRef = useRef(null)
  const notifTimer = useRef(null)
  const graphRef = useRef(null)
  const fileRef = useRef(null)
  const boundsRef = useRef(null)
  const assumedRef = useRef(null)
  const correctedRef = useRef(false)

  const notify = useCallback((text, ok = true) => {
    setNotif({ text, ok, key: Date.now() })
    clearTimeout(notifTimer.current)
    notifTimer.current = setTimeout(() => setNotif(null), 3800)
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      const d = await api.health()
      setDbStatus(Boolean(d.neo4j))
    } catch {
      setDbStatus(false)
    }
  }, [])

  const loadGraph = useCallback(async ({ silent } = {}) => {
    try {
      const data = await api.getGraph()

      /* Дедупликация узлов по id — API может отдать дубли и мусор */
      const byId = new Map()
      for (const n of data.nodes || []) {
        if (!n || n.id == null) continue
        const id = String(n.id)
        if (!byId.has(id)) byId.set(id, n)
      }

      const fn = [...byId.values()].map((n) => {
        const { level, node_type } = parseNode(n)
        const title = (n.title ?? '').toString().trim() || 'Без названия'
        return {
          id: String(n.id),
          type: 'skill',
          position: { x: 0, y: 0 },
          data: { label: title, title, level, node_type },
        }
      })

      /* Рёбра: только между существующими узлами, уникальные id */
      const known = new Set(fn.map((n) => n.id))
      const fe = []
      const edgeIds = new Set()
      ;(data.edges || []).forEach((e, i) => {
        if (!e || e.from == null || e.to == null) return
        const source = String(e.from)
        const target = String(e.to)
        if (!known.has(source) || !known.has(target)) return
        let id = e.id != null ? String(e.id) : `${source}-${target}-${i}`
        while (edgeIds.has(id)) id += '_'
        edgeIds.add(id)
        const rel = e.relation_type || 'related_to'
        const c = EDGE_COLORS[rel] || EDGE_COLORS.related_to
        fe.push({
          id,
          source,
          target,
          label: EDGE_LABELS[rel] || rel,
          type: 'smoothstep',
          animated: rel === 'requires',
          style: { stroke: c, strokeWidth: 1.6, opacity: 0.85 },
          markerEnd: { type: MarkerType.ArrowClosed, color: c, width: 13, height: 13 },
          labelStyle: { fontSize: 9, fontWeight: 600, fill: c, fontFamily: 'JetBrains Mono, monospace' },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
          labelBgStyle: { fill: 'rgba(6,8,20,0.85)' },
        })
      })
      const { nodes: positioned, headers, bounds } = applyLayout(fn)
      setNodes([...headers, ...positioned])
      setEdges(fe)
      setNodeCount(positioned.length)

      // Вьюпорт считаем сами по границам раскладки; канву перемонтируем
      // через key — defaultViewport применяется d3-зумом при инициализации
      // и не зависит от ResizeObserver-измерений узлов reactflow.
      if (bounds) {
        boundsRef.current = bounds
        correctedRef.current = false
        const cw = Math.max(320, window.innerWidth - (sidebarOpen ? SIDEBAR_W : 0))
        const ch = Math.max(320, window.innerHeight)
        assumedRef.current = { cw, ch }
        setViewport(viewportFor(bounds, cw, ch))
      }
      setEpoch((e) => e + 1)
      if (!silent && !dbStatus) notify('Neo4j недоступен — граф пуст', false)
    } catch {
      notify('Не удалось загрузить граф — сервер или база спит', false)
    }
  }, [dbStatus, notify, setEdges, setNodes, sidebarOpen])

  /* Окно могло быть ещё не развернуто в момент загрузки (webview/Electron):
     сверяем фактический размер канвы с предположенным и пересчитываем вьюпорт */
  useEffect(() => {
    if (epoch === 0 || !boundsRef.current || correctedRef.current) return
    let ticks = 0
    const timer = setInterval(() => {
      ticks += 1
      const r = graphRef.current?.getBoundingClientRect()
      const a = assumedRef.current
      if (r && r.width > 500 && a) {
        if (Math.abs(r.width - a.cw) > 80 || Math.abs(r.height - a.ch) > 80) {
          correctedRef.current = true
          setViewport(viewportFor(boundsRef.current, r.width, r.height))
          setEpoch((e) => e + 1)
        }
        clearInterval(timer)
      } else if (ticks > 16) {
        clearInterval(timer)
      }
    }, 250)
    return () => clearInterval(timer)
  }, [epoch])

  /* Будильник измерений: в средах без постоянного композита (скрытое окно
     Electron, встроенные webview) ResizeObserver узлов может не сработать —
     тогда reactflow не измеряет узлы и не рисует рёбра. Измеряем напрямую
     через экшен стора — в обычных браузерах это безвредный повтор */
  useEffect(() => {
    if (epoch === 0) return
    const wake = () => {
      try {
        const { updateNodeDimensions } = store.getState()
        const updates = [...document.querySelectorAll('.react-flow__node')]
          .map((el) => ({ id: el.dataset.id, nodeElement: el, forceUpdate: true }))
        if (updates.length) updateNodeDimensions(updates)
      } catch { /* мерить нечего — не страшно */ }
    }
    const t1 = setTimeout(wake, 450)
    const t2 = setTimeout(wake, 1600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [epoch, store])

  /* Первый вход: минимум 900мс космической тишины */
  useEffect(() => {
    let alive = true
    const t0 = Date.now()
    const boot = async () => {
      await Promise.all([loadGraph({ silent: true }), checkHealth()])
      if (!alive) return
      const wait = Math.max(0, 950 - (Date.now() - t0))
      setTimeout(() => alive && setBooting(false), wait)
    }
    boot()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Ctrl+K — поиск, Esc — закрыть панели */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSidebarOpen(true)
        setTimeout(() => searchRef.current?.focus(), 380)
      }
      if (e.key === 'Escape') {
        setChatOpen(false); setShowPanel(false); setAiPreview(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Диммирование вместо сокрытия — граф дышит целиком */
  const visibleNodes = useMemo(() => nodes.map((n) => {
    if (n.type === 'groupLabel') {
      const dimmed = filterCat !== 'all' && n.data.catType !== filterCat
      return { ...n, className: dimmed ? 'dimmed' : '' }
    }
    const d = n.data
    const dimmed =
      (search && !d.title.toLowerCase().includes(search.toLowerCase())) ||
      (filterLvl > 0 && d.level !== filterLvl) ||
      (filterCat !== 'all' && d.node_type !== filterCat)
    return { ...n, className: dimmed ? 'dimmed' : '' }
  }), [nodes, search, filterLvl, filterCat])

  /* Подписи рёбер прячутся при далёком зуме — иначе каша */
  const edgeLabelsHidden = useStore((s) => s.transform[2] < 0.35)
  const displayEdges = useMemo(
    () => (edgeLabelsHidden ? edges.map((e) => ({ ...e, label: undefined })) : edges),
    [edges, edgeLabelsHidden],
  )

  const onConnect = useCallback((p) => {
    setEdges((eds) => addEdge({
      ...p,
      type: 'smoothstep',
      label: EDGE_LABELS.related_to,
      style: { stroke: EDGE_COLORS.related_to, strokeWidth: 1.6, opacity: 0.85 },
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.related_to, width: 13, height: 13 },
      labelStyle: { fontSize: 9, fontWeight: 600, fill: EDGE_COLORS.related_to },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: 'rgba(6,8,20,0.85)' },
    }, eds))
    api.createEdge({ from_node: p.source, to_node: p.target, relation_type: 'related_to' })
      .then(() => notify('✓ Связь создана'))
      .catch(() => notify('Связь не сохранилась — проверь базу', false))
  }, [notify, setEdges])

  const addNode = async () => {
    const title = newTitle.trim()
    if (!title) return
    try {
      await api.createNode({ title, description: '', node_type: newType, level: newLevel })
      setNewTitle('')
      await loadGraph({ silent: true })
      notify(`✓ ${title} теперь в твоей вселенной`)
    } catch {
      notify('Не получилось добавить — Neo4j спит?', false)
    }
  }

  const addSkills = async () => {
    if (!aiText.trim() || analyzing) return
    setAnalyzing(true)
    setAiPreview(null)
    try {
      const res = await api.aiExtractSkills(aiText)
      if (res.error) { notify(res.error, false); return }
      if (!res.neo4j_available) {
        setAiPreview({ skills: res.ai_skills || [], gaps: res.gaps || [] })
        notify(`AI увидел ${res.ai_skills?.length || 0} навыков, но Neo4j недоступен`, false)
        return
      }
      await loadGraph({ silent: true })
      setAiText('')
      notify(`✓ Родилось ${res.skills?.length || 0} новых навыков`)
    } catch (e) {
      notify(e.message || 'AI молчит', false)
    } finally {
      setAnalyzing(false)
    }
  }

  const suggestLinks = async () => {
    setLoading(true)
    try {
      const r = await api.aiSuggestConnections()
      if (r.error) { notify(r.error, false); return }
      await loadGraph({ silent: true })
      notify(`✓ Протянуто ${r.created || 0} новых связей`)
    } catch (e) {
      notify(e.message || 'AI молчит', false)
    } finally {
      setLoading(false)
    }
  }

  const genProject = async () => {
    setLoading(true)
    try {
      const r = await api.aiGenerateProject()
      setProject(r); setRecs([]); setShowPanel(true)
      notify('✓ Проект готов')
    } catch (e) {
      notify(e.message || 'AI молчит', false)
    } finally {
      setLoading(false)
    }
  }

  const loadRecs = async () => {
    try {
      const r = await api.aiRecommendations()
      setRecs(r.recommendations || []); setProject(null); setShowPanel(true)
      notify('✓ Рекомендации готовы')
    } catch (e) {
      notify(e.message || 'AI молчит', false)
    }
  }

  const exportPng = async () => {
    const el = document.querySelector('.react-flow__viewport')
    if (!el) return
    try {
      const url = await toPng(el, { backgroundColor: BG, quality: 1, pixelRatio: 2 })
      Object.assign(document.createElement('a'), {
        download: `mindnet-${new Date().toISOString().slice(0, 10)}.png`,
        href: url,
      }).click()
      notify('✓ Снимок вселенной сохранён')
    } catch {
      notify('Экспорт не удался', false)
    }
  }

  const clearAll = () => {
    setConfirmBox({
      title: 'Стереть вселенную?',
      text: 'Все узлы и связи исчезнут безвозвратно. Сначала можно сохранить вселенную в JSON.',
      danger: 'Да, стереть',
      onYes: async () => {
        setLoading(true)
        try {
          await api.clearAll()
          setNodes([]); setEdges([]); setProject(null); setRecs([])
          setShowPanel(false); setNodeCount(0); setDetails(null)
          notify('✓ Вселенная очищена')
        } catch (e) {
          notify(e.message || 'Не вышло', false)
        } finally {
          setLoading(false)
        }
      },
    })
  }

  /* ── Редактирование узла ── */
  const saveDetails = async () => {
    if (!details?.id) return
    try {
      await api.updateNode(details.id, {
        title: details.title.trim() || details.label,
        node_type: details.node_type,
        level: details.level,
      })
      setDetails(null)
      await loadGraph({ silent: true })
      notify('✓ Узел обновлён')
    } catch (e) {
      notify(e.message || 'Сохранить не вышло', false)
    }
  }

  const deleteDetails = async () => {
    if (!details?.id) return
    const id = details.id
    setConfirmBox({
      title: `Удалить «${details.label}»?`,
      text: 'Узел и все его связи исчезнут.',
      danger: 'Удалить',
      onYes: async () => {
        try {
          await api.deleteNode(id)
          setDetails(null)
          await loadGraph({ silent: true })
          notify('✓ Узел удалён')
        } catch (e) {
          notify(e.message || 'Удалить не вышло', false)
        }
      },
    })
  }

  /* ── Бэкап вселенной ── */
  const exportJson = async () => {
    try {
      const data = await api.getGraph()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), {
        download: `mindnet-backup-${new Date().toISOString().slice(0, 10)}.json`,
        href: url,
      }).click()
      URL.revokeObjectURL(url)
      notify('✓ Вселенная сохранена в файл')
    } catch {
      notify('Экспорт не удался', false)
    }
  }

  const importJson = async (file) => {
    if (!file) return
    setLoading(true)
    try {
      const data = JSON.parse(await file.text())
      if (!Array.isArray(data.nodes)) throw new Error('нет nodes')
      let ok = 0
      for (const n of data.nodes) {
        if (!n?.title) continue
        await api.createNode({
          title: String(n.title),
          description: n.description ? String(n.description) : '',
          node_type: n.node_type || 'skill',
          level: n.level || 1,
        }).then(() => { ok += 1 }).catch(() => {})
      }
      for (const e of data.edges || []) {
        if (e?.from == null || e?.to == null) continue
        await api.createEdge({
          from_node: String(e.from),
          to_node: String(e.to),
          relation_type: e.relation_type || 'related_to',
        }).catch(() => {})
      }
      await loadGraph({ silent: true })
      notify(`✓ Импортировано ${ok} узлов`)
    } catch {
      notify('Файл не похож на вселенную MindNet', false)
    } finally {
      setLoading(false)
    }
  }

  const previewCat = CAT[newType] || CAT.skill

  return (
    <div className="app">
      {/* ── Космос ── */}
      <div className="cosmos" aria-hidden>
        <div className="cosmos__nebula cosmos__nebula--1" />
        <div className="cosmos__nebula cosmos__nebula--2" />
        <div className="cosmos__nebula cosmos__nebula--3" />
        <div className="cosmos__stars cosmos__stars--far" />
        <div className="cosmos__stars cosmos__stars--near" />
        <div className="cosmos__comet" />
        <div className="cosmos__vignette" />
      </div>

      {/* ── Сайдбар ── */}
      <aside
        className="rail"
        style={{ width: sidebarOpen ? SIDEBAR_W : 0, pointerEvents: sidebarOpen ? 'auto' : 'none' }}
      >
        <div className="sidebar">
          <div className="sidebar__head">
            <div className="brand">
              <div className="brand__mark"><Glyph id="mn-g1" /></div>
              <div>
                <div className="brand__name">MindNet AI</div>
                <div className={`db-pill db-pill--${dbStatus === null ? 'wait' : dbStatus ? 'ok' : 'err'}`}>
                  <span className="db-pill__dot" />
                  {dbStatus === null ? 'соединение…' : dbStatus ? `neo4j · ${nodeCount} знаний` : 'neo4j недоступен'}
                </div>
              </div>
            </div>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)} title="Свернуть панель">‹</button>
          </div>

          <div className="sidebar__body">
            {/* Новый навык */}
            <section className="section">
              <div className="section__title">Новый навык</div>
              <input
                className="field"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNode()}
                placeholder="Python, Docker, матанализ…"
              />
              <div className="field-row">
                <select className="field" style={{ flex: 1 }} value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {CAT_ORDER.map((t) => <option key={t} value={t}>{CAT[t].icon} {CAT[t].label}</option>)}
                </select>
                <select className="field" style={{ width: 70 }} value={newLevel} onChange={(e) => setNewLevel(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>L{l}</option>)}
                </select>
              </div>
              <div className="preview" style={{ '--c-rgb': previewCat.rgb }}>
                <span className="preview__icon">{previewCat.icon}</span>
                <span className="preview__cat">{previewCat.label}</span>
                <div className="preview__bars">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`pv-bar${i <= newLevel ? ' pv-bar--on' : ''}`} />
                  ))}
                </div>
                <span className="preview__lvl">{LEVELS[newLevel]}</span>
              </div>
              <button className="btn btn--primary" style={{ marginTop: 9 }} onClick={addNode}>＋ Добавить в граф</button>
            </section>

            {/* AI-анализ */}
            <section className="section">
              <div className="section__title">AI-анализ</div>
              <textarea
                className="field"
                rows={4}
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="Расскажи о своём опыте и стеке — AI сам извлечёт навыки и оценит уровень…"
                disabled={analyzing}
              />
              <button className="btn btn--ai" style={{ marginTop: 8 }} onClick={addSkills} disabled={analyzing}>
                {analyzing
                  ? <><span className="spinner" /> Читаю между строк…</>
                  : <>✦ Извлечь навыки</>}
              </button>
            </section>

            {/* AI-инструменты */}
            <section className="section">
              <div className="section__title">AI-инструменты</div>
              <button className="btn btn--tool" style={{ '--tc-rgb': '251,191,36' }} onClick={suggestLinks} disabled={loading}>⟡ Авто-связи</button>
              <button className="btn btn--tool" style={{ '--tc-rgb': '52,211,153' }} onClick={genProject} disabled={loading}>◈ Сгенерировать проект</button>
              <button className="btn btn--tool" style={{ '--tc-rgb': '129,140,248' }} onClick={loadRecs}>◉ Что учить дальше</button>
            </section>

            {/* Фильтры */}
            <section className="section">
              <div className="section__title">Фильтры</div>
              <input
                ref={searchRef}
                className="field"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию…   (Ctrl+K)"
              />
              <div className="chips">
                {[0, 1, 2, 3, 4, 5].map((l) => (
                  <button
                    key={l}
                    className={`chip${filterLvl === l ? ' chip--on' : ''}`}
                    style={{ '--cc-rgb': l === 0 ? '148,163,214' : CAT.concept.rgb }}
                    onClick={() => setFilterLvl(l)}
                  >
                    {l === 0 ? 'все' : `L${l}`}
                  </button>
                ))}
              </div>
              <div className="chips">
                <button
                  className={`chip${filterCat === 'all' ? ' chip--on' : ''}`}
                  style={{ '--cc-rgb': '148,163,214' }}
                  onClick={() => setFilterCat('all')}
                >
                  всё
                </button>
                {CAT_ORDER.map((t) => (
                  <button
                    key={t}
                    className={`chip chip-icon${filterCat === t ? ' chip--on' : ''}`}
                    style={{ '--cc-rgb': CAT[t].rgb }}
                    title={CAT[t].label}
                    onClick={() => setFilterCat(t)}
                  >
                    {CAT[t].icon}
                  </button>
                ))}
              </div>
              {(search || filterLvl > 0 || filterCat !== 'all') && (
                <button
                  className="btn btn--ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => { setSearch(''); setFilterLvl(0); setFilterCat('all') }}
                >
                  ↺ Показать всё
                </button>
              )}
            </section>

            {/* Действия */}
            <section className="section">
              <div className="section__title">Действия</div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button className="btn btn--ghost" onClick={exportPng}>⬇ PNG</button>
                <button className="btn btn--ghost" onClick={exportJson}>⬇ JSON</button>
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                <button className="btn btn--ghost" onClick={() => fileRef.current?.click()} disabled={loading}>⬆ Импорт</button>
                <button
                  className="btn btn--ghost"
                  onClick={() => { loadGraph({ silent: true }); checkHealth(); notify('✓ Обновлено') }}
                >
                  ↻ Обновить
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  importJson(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button className="btn btn--danger" onClick={clearAll} disabled={loading}>✕ Стереть вселенную</button>
            </section>
          </div>

          <div className="sidebar__foot">
            <button className="chat-btn" onClick={() => setChatOpen(true)}>
              <span className="chat-btn__dot" /> Чат с ментором
            </button>
          </div>
        </div>
      </aside>

      {/* ── Кнопка раскрытия ── */}
      {!sidebarOpen && (
        <button className="rail-btn" onClick={() => setSidebarOpen(true)} title="Открыть панель">
          <Glyph id="mn-g2" />
        </button>
      )}

      {/* ── Граф ── */}
      <div ref={graphRef} className="app__graph" style={{ left: sidebarOpen ? SIDEBAR_W : 0 }}>
        {nodeCount === 0 && !booting && (
          <div className="void">
            <VoidArt />
            <h2 className="void__title">Твой разум пока пуст</h2>
            <p className="void__sub">
              Добавь первый навык слева или доверься <b>AI-анализу</b> — опиши свой опыт,
              и созвездие знаний соберётся само.
            </p>
            <div className="void__hint">
              <kbd>Ctrl</kbd><kbd>K</kbd> поиск · тяни от узла к узлу, чтобы связать
            </div>
          </div>
        )}

        <ReactFlow
          key={epoch}
          nodes={visibleNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => {
            if (n.type === 'skill') {
              setDetails({ id: n.id, ...n.data })
              setShowPanel(false); setAiPreview(null)
            }
          }}
          connectionLineType="smoothstep"
          connectionLineStyle={{ stroke: '#8b5cf6', strokeWidth: 1.6, strokeDasharray: '5 4' }}
          defaultViewport={viewport}
          minZoom={0.05}
          maxZoom={4}
          style={{ width: '100%', height: '100%' }}
        >
          <Background color="rgba(148,163,214,0.05)" gap={34} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (n.type === 'groupLabel' ? 'rgba(148,163,214,0.15)' : (CAT[n.data?.node_type]?.color || '#818cf8'))}
            nodeStrokeWidth={0}
            maskColor="rgba(3,4,12,0.72)"
          />
          <Panel position="bottom-center">
            <div className="legend">
              {Object.entries(EDGE_COLORS).map(([rel, color]) => (
                <div key={rel} className="legend__item">
                  <span className="legend__dot" style={{ background: color, boxShadow: `0 0 7px ${color}` }} />
                  <span>{EDGE_LABELS[rel]}</span>
                </div>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* ── Уведомление ── */}
      {notif && (
        <div key={notif.key} className={`notif notif--${notif.ok ? 'ok' : 'err'}`}>
          {notif.text}
        </div>
      )}

      {/* ── Панель результатов ── */}
      {showPanel && (
        <div className="result">
          <button className="result__close" onClick={() => setShowPanel(false)}>×</button>

          {project && (
            <>
              <div className="result__header" style={{ color: '#6ee7b7' }}>
                <span>◈</span> Проект под твой уровень
              </div>
              <div className="result__title">{project.title}</div>
              <p className="result__desc">{project.description}</p>
              {project.technologies?.length > 0 && (
                <div className="result__tags">
                  {project.technologies.map((t, i) => <span key={i} className="tag">{t}</span>)}
                </div>
              )}
              <div className="result__meta">⏱ ~{project.estimated_hours} ч · {project.difficulty}</div>
              {project.learning_goals?.length > 0 && (
                <>
                  <div className="result__sub">Чему научишься</div>
                  {project.learning_goals.map((g, i) => <div key={i} className="result__goal">{g}</div>)}
                </>
              )}
            </>
          )}

          {recs.length > 0 && (
            <>
              <div className="result__header" style={{ color: '#a5b4fc' }}>
                <span>◉</span> Путь развития
              </div>
              {recs.map((r, i) => (
                <div key={i} className="rec">
                  <span className="rec__num">{String(i + 1).padStart(2, '0')}</span>
                  {r}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Панель узла: редактирование ── */}
      {details && (
        <div className="result" key={details.id}>
          <button className="result__close" onClick={() => setDetails(null)}>×</button>
          <div className="result__header" style={{ color: CAT[details.node_type]?.color || '#a5b4fc' }}>
            <span>{CAT[details.node_type]?.icon || '🧠'}</span> Редактирование узла
          </div>
          <input
            className="field"
            style={{ marginBottom: 8 }}
            value={details.title}
            onChange={(e) => setDetails({ ...details, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveDetails()}
            placeholder="Название навыка"
          />
          <div className="field-row" style={{ marginTop: 0 }}>
            <select
              className="field"
              style={{ flex: 1 }}
              value={details.node_type}
              onChange={(e) => setDetails({ ...details, node_type: e.target.value })}
            >
              {CAT_ORDER.map((t) => <option key={t} value={t}>{CAT[t].icon} {CAT[t].label}</option>)}
            </select>
            <select
              className="field"
              style={{ width: 70 }}
              value={details.level}
              onChange={(e) => setDetails({ ...details, level: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>L{l}</option>)}
            </select>
          </div>
          <button className="btn btn--primary" style={{ marginTop: 10 }} onClick={saveDetails}>
            ✓ Сохранить
          </button>
          <button className="btn btn--danger" onClick={deleteDetails}>✕ Удалить узел</button>
        </div>
      )}

      {/* ── Диалог подтверждения ── */}
      {confirmBox && (
        <div className="modal-backdrop" onClick={() => setConfirmBox(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">{confirmBox.title}</div>
            <p className="modal__text">{confirmBox.text}</p>
            <div className="modal__row">
              <button className="btn btn--ghost" onClick={() => setConfirmBox(null)}>Отмена</button>
              <button
                className="btn btn--danger"
                onClick={async () => { setConfirmBox(null); await confirmBox.onYes() }}
              >
                {confirmBox.danger}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI нашёл навыки, но база спит ── */}
      {aiPreview && (
        <div className="result result--warn">
          <button className="result__close" onClick={() => setAiPreview(null)}>×</button>
          <div className="result__header" style={{ color: '#fde68a' }}>
            <span>⚠</span> Neo4j не отвечает
          </div>
          <p className="result__desc">AI уже разглядел {aiPreview.skills.length} навыков — запусти базу и повтори.</p>
          {aiPreview.skills.map((s, i) => {
            const c = CAT[s.category] || CAT.skill
            return (
              <div key={i} className="ai-row" style={{ '--c-rgb': c.rgb }}>
                <span className="ai-row__icon">{c.icon}</span>
                <span className="ai-row__name">{s.name}</span>
                <div className="ai-row__bars">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <div key={j} className={`ai-row__bar${j <= (s.level || 1) ? ' ai-row__bar--on' : ''}`} />
                  ))}
                </div>
                <span className="ai-row__lvl">L{s.level || 1}</span>
              </div>
            )
          })}
          <div className="warn-note" style={{ marginTop: 10 }}>
            Запусти <strong>Neo4j Desktop → Start</strong> и нажми «Извлечь навыки» ещё раз.
          </div>
        </div>
      )}

      {/* ── Чат ── */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} onRefresh={() => loadGraph({ silent: true })} />}

      {/* ── Загрузка ── */}
      <div className={`boot${booting ? '' : ' boot--done'}`} aria-hidden={!booting}>
        <svg className="boot__art" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="boot-g" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset=".5" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#f472b6" />
            </linearGradient>
          </defs>
          <g stroke="url(#boot-g)" strokeWidth="2" opacity=".7">
            <path d="M20 18 L44 24 L46 44 L26 48 Z" />
            <path d="M20 18 L26 48" opacity=".5" />
          </g>
          <g fill="url(#boot-g)">
            <circle cx="20" cy="18" r="5"><animate attributeName="opacity" values="1;.45;1" dur="2.2s" repeatCount="indefinite" /></circle>
            <circle cx="44" cy="24" r="4.4"><animate attributeName="opacity" values=".45;1;.45" dur="2.2s" repeatCount="indefinite" /></circle>
            <circle cx="46" cy="44" r="4"><animate attributeName="opacity" values="1;.45;1" dur="2.2s" begin=".7s" repeatCount="indefinite" /></circle>
            <circle cx="26" cy="48" r="5"><animate attributeName="opacity" values=".45;1;.45" dur="2.2s" begin=".7s" repeatCount="indefinite" /></circle>
          </g>
        </svg>
        <div className="boot__name">MindNet</div>
        <div className="boot__bar" />
      </div>
    </div>
  )
}

/* Провайдер нужен, чтобы будильник измерений имел доступ к стору reactflow */
const GraphCanvasWithProvider = () => (
  <ReactFlowProvider>
    <GraphCanvas />
  </ReactFlowProvider>
)

export default GraphCanvasWithProvider
