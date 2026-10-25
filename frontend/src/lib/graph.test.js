import { describe, it, expect } from 'vitest'
import { parseNode, applyLayout, viewportFor, CAT_ORDER } from './graph'

/* ─── parseNode: всеядность к мусору от API ─────────────────── */
describe('parseNode', () => {
  it('нормальный узел проходит как есть', () => {
    expect(parseNode({ level: 3, node_type: 'language' })).toEqual({ level: 3, node_type: 'language' })
  })

  it('уровень клампится в 1..5', () => {
    expect(parseNode({ level: 999 }).level).toBe(5)
    expect(parseNode({ level: -7 }).level).toBe(1)
    expect(parseNode({ level: 'abc' }).level).toBe(1)
    expect(parseNode({}).level).toBe(1)
  })

  it('неизвестный тип падает в skill', () => {
    expect(parseNode({ node_type: 'quantum' }).node_type).toBe('skill')
    expect(parseNode({ node_type: 42 }).node_type).toBe('skill')
    expect(parseNode({ node_type: null }).node_type).toBe('skill')
  })

  it('тип и уровень извлекаются из description, если level не задан', () => {
    expect(parseNode({ description: 'framework Level 5 from CV' }))
      .toEqual({ level: 5, node_type: 'framework' })
  })

  it('регистр не важен', () => {
    expect(parseNode({ node_type: 'LANGUAGE' }).node_type).toBe('language')
  })

  it('description-число не роняет парсер', () => {
    expect(parseNode({ description: 42, level: 2 })).toEqual({ level: 2, node_type: 'skill' })
  })
})

/* ─── applyLayout: созвездия ──────────────────────────────────── */
describe('applyLayout', () => {
  const mk = (id, type) => ({ id, type: 'skill', data: { node_type: type, title: 'T' + id } })

  it('пустой вход — пустой выход', () => {
    expect(applyLayout([])).toEqual({ nodes: [], headers: [], bounds: null })
  })

  it('одна категория — один заголовок с верным счётчиком', () => {
    const { nodes, headers, bounds } = applyLayout([mk(1, 'tool'), mk(2, 'tool')])
    expect(nodes).toHaveLength(2)
    expect(headers).toHaveLength(1)
    expect(headers[0].data).toEqual({ catType: 'tool', count: 2 })
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThan(0)
  })

  it('карточки одной группы не пересекаются', () => {
    const items = []
    for (let i = 1; i <= 20; i++) items.push(mk(i, 'language'))
    const { nodes } = applyLayout(items)
    const rects = nodes.map((n) => ({
      x: n.position.x, y: n.position.y, w: 170, h: 104,
    }))
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j]
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        expect(ox > 4 && oy > 4).toBe(false)
      }
    }
  })

  it('группы идут в каноническом порядке категорий', () => {
    const { headers } = applyLayout([mk(1, 'skill'), mk(2, 'language'), mk(3, 'concept')])
    expect(headers.map((h) => h.data.catType)).toEqual(
      ['language', 'concept', 'skill'].filter((t) => CAT_ORDER.includes(t)),
    )
  })

  it('все узлы и заголовки получают конечные координаты', () => {
    const { nodes, headers } = applyLayout([mk(1, 'tool'), mk(2, 'math'), mk(3, 'tool')])
    ;[...nodes, ...headers].forEach((n) => {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    })
  })
})

/* ─── viewportFor: вписать и отцентрировать ──────────────────── */
describe('viewportFor', () => {
  it('широкий граф вписывается по ширине и центрируется', () => {
    const b = { x: 0, y: 0, width: 2000, height: 200 }
    const vp = viewportFor(b, 1000, 800)
    expect(vp.zoom).toBeCloseTo((1000 - 88) / 2000, 5)
    // центрирование: граф занимает всю ширину, отступы симметричны
    expect(vp.x).toBeCloseTo((1000 - 2000 * vp.zoom) / 2, 5)
    expect(vp.y).toBeGreaterThan(0)
  })

  it('мелкий граф не приближается сильнее 1.1', () => {
    const vp = viewportFor({ x: 0, y: 0, width: 100, height: 100 }, 1300, 900)
    expect(vp.zoom).toBe(1.1)
  })

  it('никуда не улетает при вырожденном контейнере', () => {
    const vp = viewportFor({ x: 0, y: 0, width: 100000, height: 100 }, 320, 320)
    expect(vp.zoom).toBeGreaterThanOrEqual(0.05)
    expect(Number.isFinite(vp.x)).toBe(true)
    expect(Number.isFinite(vp.y)).toBe(true)
  })
})
