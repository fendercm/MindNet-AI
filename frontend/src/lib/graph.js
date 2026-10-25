// frontend/src/lib/graph.js — чистая логика графа, без React.
// Живёт отдельно, чтобы гонять юнит-тесты без браузера.

export const BG = '#05060f'

export const CAT = {
  language:  { color: '#38bdf8', rgb: '56,189,248',   icon: '⌨',  label: 'Язык'       },
  framework: { color: '#f472b6', rgb: '244,114,182',  icon: '⚡',  label: 'Фреймворк'  },
  library:   { color: '#a78bfa', rgb: '167,139,250',  icon: '📦', label: 'Библиотека' },
  database:  { color: '#fbbf24', rgb: '251,191,36',   icon: '🗄',  label: 'База данных'},
  tool:      { color: '#34d399', rgb: '52,211,153',   icon: '🔧', label: 'Инструмент' },
  math:      { color: '#fb923c', rgb: '251,146,60',   icon: '📐', label: 'Математика' },
  concept:   { color: '#818cf8', rgb: '129,140,248',  icon: '💡', label: 'Концепция'  },
  skill:     { color: '#e879f9', rgb: '232,121,249',  icon: '🧠', label: 'Навык'      },
}
export const CAT_ORDER = ['language', 'framework', 'library', 'database', 'tool', 'math', 'concept', 'skill']

export const EDGE_COLORS = {
  requires:    '#f472b6',
  extends:     '#38bdf8',
  complements: '#34d399',
  used_with:   '#fbbf24',
  related_to:  '#64748b',
}
export const EDGE_LABELS = {
  requires: 'требует', extends: 'расширяет', complements: 'дополняет',
  used_with: 'вместе', related_to: 'связано',
}

export const LEVELS = ['', 'Новичок', 'Базовый', 'Средний', 'Продвинутый', 'Эксперт']

/* ─── Разбор узла: тотально всеядный ────────────────────────── */
export const parseNode = (n) => {
  let level = parseInt(n.level) || 1
  let node_type = String(n.node_type ?? 'skill').toLowerCase()
  const desc = n.description != null ? String(n.description) : ''
  if ((!n.level || n.level === 1) && desc) {
    const m = desc.match(/Level\s*(\d+)/i)
    if (m) level = parseInt(m[1])
    const c = desc.match(/^(language|framework|library|database|tool|math|concept)/i)
    if (c) node_type = c[1].toLowerCase()
  }
  return {
    level: Math.min(Math.max(level, 1), 5),
    node_type: CAT_ORDER.includes(node_type) ? node_type : 'skill',
  }
}

/* ─── Раскладка: созвездия по категориям ────────────────────── */
const NW = 170, NH = 104, PX = 18, PY = 18, GX = 110, HEADER_H = 58

export const applyLayout = (nodes) => {
  if (!nodes.length) return { nodes: [], headers: [], bounds: null }

  const groups = {}
  CAT_ORDER.forEach((t) => { groups[t] = [] })
  nodes.forEach((n) => {
    const t = n.data.node_type
    if (!groups[t]) groups[t] = []
    groups[t].push(n)
  })

  const filled = CAT_ORDER.filter((t) => groups[t].length)
  const positioned = []
  const headers = []
  let cx = 0
  let maxH = 0

  filled.forEach((type) => {
    const g = groups[type]
    const cols = Math.max(1, Math.ceil(Math.sqrt(g.length * 1.5)))
    const rows = Math.ceil(g.length / cols)
    const gw = cols * (NW + PX) - PX + 44
    const gh = HEADER_H + rows * (NH + PY) - PY + 20
    maxH = Math.max(maxH, gh)

    g.forEach((node, i) => {
      positioned.push({
        ...node,
        position: {
          x: cx + 22 + (i % cols) * (NW + PX),
          y: HEADER_H + Math.floor(i / cols) * (NH + PY),
        },
      })
    })

    headers.push({
      id: `__hdr_${type}`,
      type: 'groupLabel',
      position: { x: cx + 24, y: 16 },
      data: { catType: type, count: g.length },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      zIndex: -1,
    })

    cx += gw + GX
  })

  return {
    nodes: positioned,
    headers,
    bounds: { x: -16, y: -12, width: cx - GX + 48, height: maxH + 30 },
  }
}

/* ─── Вьюпорт по границам: вписать и отцентрировать ─────────── */
export const viewportFor = (b, cw, ch, pad = 44) => {
  const zoom = Math.max(0.05, Math.min((cw - pad * 2) / b.width, (ch - pad * 2) / b.height, 1.1))
  return {
    x: (cw - b.width * zoom) / 2 - b.x * zoom,
    y: (ch - b.height * zoom) / 2 - b.y * zoom,
    zoom,
  }
}
