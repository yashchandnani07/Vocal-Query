// diagrams.js : the two pictures of the database.
//   1. drawSchemaCanvas() -> "Schema" tab: table cards on a grid, dashed lines from each
//      foreign key to the primary key it points to. Drag a card by its header.
//   2. drawChenEr()       -> "ER Diagram" tab: textbook (Chen) ER diagram:
//      rectangle = entity, oval = attribute, diamond = relationship, 1 / N = cardinality,
//      double line = total participation (the foreign key is NOT NULL).
// Both are built only from GET /api/schema. Uses el() from app.js.

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  if (text !== undefined) node.textContent = text
  return node
}

function legend(items) {
  const box = el('div', 'diagram-legend')
  for (const [symbol, label] of items) {
    const item = el('span', 'legend-item')
    item.append(el('span', 'legend-symbol', symbol), el('span', '', label))
    box.append(item)
  }
  return box
}

// [ − ] 80% [ + ] [ Fit ] buttons. getZoom/setZoom/fit come from the diagram that uses them.
function zoomControls(getZoom, setZoom, fit) {
  const box = el('div', 'zoom')
  const minus = el('button', 'zoom-btn', '−')
  const label = el('span', 'zoom-label')
  const plus = el('button', 'zoom-btn', '+')
  const fitBtn = el('button', 'btn btn-secondary btn-sm', 'Fit')
  const show = () => (label.textContent = Math.round(getZoom() * 100) + '%')
  minus.onclick = () => { setZoom(Math.max(0.3, getZoom() - 0.1)); show() }
  plus.onclick = () => { setZoom(Math.min(2, getZoom() + 0.1)); show() }
  fitBtn.onclick = () => { fit(); show() }
  minus.title = 'Zoom out'
  plus.title = 'Zoom in'
  box.append(minus, label, plus, fitBtn)
  box.show = show
  return box
}

// =====================================================================
// 1. Schema visualizer
// =====================================================================

const CARD_W = 300
const HEAD_H = 40
const ROW_H = 36
const cardPositions = {} // where each card was dragged to (kept while the page is open)
let schemaZoom = null // null = "fit everything" the first time the canvas is drawn

// Children (tables with foreign keys) go on the left, the tables they point to on the right.
function autoLayout(schema) {
  const rank = {}
  const parentsOf = (name) => schema.relations.filter((r) => r.from === name && r.to !== name).map((r) => r.to)
  function getRank(name, visiting = new Set()) {
    if (name in rank) return rank[name]
    if (visiting.has(name)) return 0 // a loop of foreign keys: stop here
    visiting.add(name)
    const parents = parentsOf(name)
    rank[name] = parents.length ? 1 + Math.max(...parents.map((p) => getRank(p, visiting))) : 0
    return rank[name]
  }
  schema.tables.forEach((t) => getRank(t.name))
  const maxRank = Math.max(0, ...Object.values(rank))

  const positions = {}
  const columnHeight = {}
  for (const table of schema.tables) {
    const column = maxRank - rank[table.name]
    const top = columnHeight[column] || 60
    positions[table.name] = { x: 40 + column * (CARD_W + 140), y: top }
    columnHeight[column] = top + HEAD_H + table.columns.length * ROW_H + 50
  }
  return positions
}

function drawSchemaCanvas(view, schema) {
  const auto = autoLayout(schema)
  const pos = {}
  for (const t of schema.tables) pos[t.name] = cardPositions[t.name] || auto[t.name]

  const canvas = el('div', 'schema-canvas')
  const lines = svgEl('svg', { class: 'schema-lines' })
  canvas.append(lines)

  const toolbar = el('div', 'diagram-toolbar')
  const resetBtn = el('button', 'btn btn-secondary btn-sm', 'Auto layout')
  resetBtn.onclick = () => {
    for (const name in cardPositions) delete cardPositions[name]
    schemaZoom = null
    drawSchemaCanvas(view, schema)
  }
  const setZoom = (z) => { schemaZoom = z; canvas.style.zoom = z }
  const fit = () => { // zoom so the whole canvas fits the visible area (never above 100%)
    const area = document.querySelector('.tab-body')
    setZoom(Math.max(0.4, Math.min(1, (area.clientWidth - 8) / parseFloat(canvas.style.width), (area.clientHeight - 60) / parseFloat(canvas.style.height))))
  }
  const zoom = zoomControls(() => schemaZoom, setZoom, fit)
  const actions = el('div', 'toolbar-actions')
  actions.append(zoom, resetBtn)
  toolbar.append(legend([['🔑', 'primary key'], ['◆', 'NOT NULL'], ['◇', 'nullable'], ['⇢', 'foreign key']]), actions)

  const cards = {}
  for (const table of schema.tables) {
    const card = schemaCard(table)
    cards[table.name] = card
    placeCard(card, pos[table.name])
    makeDraggable(card, card.querySelector('.erd-head'), (x, y) => {
      pos[table.name] = cardPositions[table.name] = { x, y }
      placeCard(card, pos[table.name])
      redraw()
    })
    // Hovering a card highlights its relationship lines
    card.onmouseenter = () => lines.querySelectorAll(`[data-tables~="${table.name}"]`).forEach((p) => p.classList.add('hot'))
    card.onmouseleave = () => lines.querySelectorAll('.hot').forEach((p) => p.classList.remove('hot'))
    canvas.append(card)
  }

  function redraw() {
    // Grow the canvas so every card fits, then draw the lines again
    let width = 0
    let height = 0
    for (const table of schema.tables) {
      width = Math.max(width, pos[table.name].x + CARD_W + 80)
      height = Math.max(height, pos[table.name].y + HEAD_H + table.columns.length * ROW_H + 80)
    }
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    lines.setAttribute('width', width)
    lines.setAttribute('height', height)
    lines.replaceChildren()
    for (const relation of schema.relations) drawRelationLine(lines, schema, pos, relation)
  }

  view.replaceChildren(toolbar, canvas)
  redraw()
  if (schemaZoom === null) fit()
  else setZoom(schemaZoom)
  zoom.show()
}

function schemaCard(table) {
  const card = el('div', 'erd-card')
  card.id = 'table-' + table.name
  card.append(el('div', 'erd-head', table.name))
  for (const col of table.columns) {
    const row = el('div', 'erd-row')
    const icons = el('span', 'erd-icons')
    icons.append(el('span', 'erd-key', col.pk ? '🔑' : ''))
    icons.append(el('span', 'erd-null', col.notNull ? '◆' : '◇'))
    icons.title = (col.pk ? 'Primary key, ' : '') + (col.notNull ? 'NOT NULL' : 'can be NULL')
    const name = el('span', 'erd-name', col.name)
    if (col.fk) name.title = 'Foreign key → ' + col.fk
    row.append(icons, name, el('span', 'erd-type', shortType(col.type)))
    if (col.fk) row.classList.add('is-fk')
    card.append(row)
  }
  return card
}

// "character varying" -> "varchar", "timestamp without time zone" -> "timestamp"
function shortType(type) {
  return type.replace('character varying', 'varchar').replace(' without time zone', '').replace(' with time zone', 'tz')
}

function placeCard(card, p) {
  card.style.left = p.x + 'px'
  card.style.top = p.y + 'px'
}

function makeDraggable(card, handle, onMove) {
  handle.addEventListener('pointerdown', (down) => {
    handle.setPointerCapture(down.pointerId)
    const startLeft = parseFloat(card.style.left)
    const startTop = parseFloat(card.style.top)
    const z = schemaZoom || 1 // mouse moves in screen pixels; the canvas may be zoomed
    const move = (e) => onMove(
      Math.max(0, startLeft + (e.clientX - down.clientX) / z),
      Math.max(0, startTop + (e.clientY - down.clientY) / z),
    )
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  })
}

// Middle (y) of a column's row inside its card
function rowY(schema, pos, tableName, columnName) {
  const table = schema.tables.find((t) => t.name === tableName)
  const index = Math.max(0, table.columns.findIndex((c) => c.name === columnName))
  return pos[tableName].y + 1 + HEAD_H + index * ROW_H + ROW_H / 2
}

// Dashed elbow line: foreign key row (child) -> primary key row (parent)
function drawRelationLine(svg, schema, pos, r) {
  const y1 = rowY(schema, pos, r.from, r.column)
  const y2 = rowY(schema, pos, r.to, r.toColumn)
  const child = pos[r.from]
  const parent = pos[r.to]
  let x1, x2, path
  if (child.x + CARD_W < parent.x) { // parent is to the right
    x1 = child.x + CARD_W
    x2 = parent.x
    const mid = (x1 + x2) / 2
    path = `M${x1} ${y1} H${mid} V${y2} H${x2}`
  } else if (parent.x + CARD_W < child.x) { // parent is to the left
    x1 = child.x
    x2 = parent.x + CARD_W
    const mid = (x1 + x2) / 2
    path = `M${x1} ${y1} H${mid} V${y2} H${x2}`
  } else { // cards overlap sideways (or same table): go around the right side
    x1 = child.x + CARD_W
    x2 = parent.x + CARD_W
    const out = Math.max(x1, x2) + 36
    path = `M${x1} ${y1} H${out} V${y2} H${x2}`
  }
  const group = svgEl('g', { 'data-tables': `${r.from} ${r.to}`, class: 'rel' })
  group.append(svgEl('path', { d: path, class: 'rel-line' }))
  group.append(svgEl('circle', { cx: x1, cy: y1, r: 3.5, class: 'rel-end' }))
  group.append(svgEl('circle', { cx: x2, cy: y2, r: 3.5, class: 'rel-end' }))
  const title = svgEl('title', {}, `${r.from}.${r.column} → ${r.to}.${r.toColumn}`)
  group.append(title)
  svg.append(group)
}

// =====================================================================
// 2. Chen ER diagram
// =====================================================================

const measureCtx = document.createElement('canvas').getContext('2d')
function textWidth(text, font = '500 13px Inter, sans-serif') {
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

// Simple force layout: entities push each other away, relationships pull them together.
function forceLayout(names, edges) {
  const pos = {}
  names.forEach((name, i) => {
    const angle = (2 * Math.PI * i) / names.length
    pos[name] = { x: Math.cos(angle) * 300, y: Math.sin(angle) * 300 }
  })
  const K = names.length <= 2 ? 380 : 290 + 40 * Math.max(0, names.length - 3) // preferred distance; bigger groups get more room
  const STEPS = 300
  for (let step = 0; step < STEPS; step++) {
    const move = {}
    names.forEach((n) => (move[n] = { x: 0, y: 0 }))
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = pos[names[i]], b = pos[names[j]]
        const dx = a.x - b.x, dy = a.y - b.y
        const dist = Math.max(1, Math.hypot(dx, dy))
        const push = (K * K) / dist
        move[names[i]].x += (dx / dist) * push; move[names[i]].y += (dy / dist) * push
        move[names[j]].x -= (dx / dist) * push; move[names[j]].y -= (dy / dist) * push
      }
    }
    for (const [a, b] of edges) {
      if (a === b) continue
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y
      const dist = Math.max(1, Math.hypot(dx, dy))
      const pull = (dist * dist) / K
      move[a].x -= (dx / dist) * pull; move[a].y -= (dy / dist) * pull
      move[b].x += (dx / dist) * pull; move[b].y += (dy / dist) * pull
    }
    const maxStep = 40 * (1 - step / STEPS) + 2 // moves get smaller over time
    for (const n of names) {
      const len = Math.max(1, Math.hypot(move[n].x, move[n].y))
      pos[n].x += (move[n].x / len) * Math.min(len, maxStep)
      pos[n].y += (move[n].y / len) * Math.min(len, maxStep)
    }
  }

  // Turn the picture so the two entities furthest apart sit on a horizontal line (screens are wide)
  let far = { d: 0, angle: 0 }
  for (const a of names) {
    for (const b of names) {
      const d = Math.hypot(pos[b].x - pos[a].x, pos[b].y - pos[a].y)
      if (d > far.d) far = { d, angle: Math.atan2(pos[b].y - pos[a].y, pos[b].x - pos[a].x) }
    }
  }
  const cos = Math.cos(-far.angle), sin = Math.sin(-far.angle)
  for (const n of names) {
    const { x, y } = pos[n]
    pos[n] = { x: x * cos - y * sin, y: x * sin + y * cos }
  }
  return pos
}

// Tables that are not connected by any foreign key are laid out as separate groups,
// then the groups are placed next to each other (otherwise they would push each other miles apart).
function layoutGroups(schema) {
  const group = {}
  for (const t of schema.tables) group[t.name] = t.name
  const find = (n) => (group[n] === n ? n : (group[n] = find(group[n])))
  for (const r of schema.relations) group[find(r.from)] = find(r.to)

  const groups = {}
  for (const t of schema.tables) (groups[find(t.name)] ||= []).push(t.name)
  const sorted = Object.values(groups).sort((a, b) => b.length - a.length)

  const pos = {}
  let cursorX = 0
  for (const names of sorted) {
    const edges = schema.relations.filter((r) => names.includes(r.from)).map((r) => [r.from, r.to])
    const local = names.length === 1 ? { [names[0]]: { x: 0, y: 0 } } : forceLayout(names, edges)
    const xs = names.map((n) => local[n].x)
    const minX = Math.min(...xs)
    for (const n of names) pos[n] = { x: local[n].x - minX + cursorX, y: local[n].y }
    cursorX += Math.max(...xs) - minX + 560 // room for attributes on both sides + a gap
  }
  return pos
}

// Pick the widest empty angle around an entity (away from its relationship lines) for its attributes.
function freeArc(center, targets) {
  if (targets.length === 0) return { mid: -Math.PI / 2, span: 2 * Math.PI * 0.8 }
  const angles = targets.map((t) => Math.atan2(t.y - center.y, t.x - center.x)).sort((a, b) => a - b)
  let best = { mid: 0, gap: 0 }
  for (let i = 0; i < angles.length; i++) {
    const from = angles[i]
    const to = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI
    if (to - from > best.gap) best = { mid: (from + to) / 2, gap: to - from }
  }
  return { mid: best.mid, span: Math.max(best.gap - 0.9, 1.2) }
}

function drawChenEr(view, schema) {
  const pos = layoutGroups(schema)

  const svg = svgEl('svg', { class: 'chen' })
  const lineLayer = svgEl('g')
  const shapeLayer = svgEl('g')
  svg.append(lineLayer, shapeLayer)
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const grow = (x, y, w = 0, h = 0) => {
    bounds.minX = Math.min(bounds.minX, x - w); bounds.maxX = Math.max(bounds.maxX, x + w)
    bounds.minY = Math.min(bounds.minY, y - h); bounds.maxY = Math.max(bounds.maxY, y + h)
  }

  const line = (a, b, double) => {
    if (double) { // thick line with a thin white line on top looks like a double line
      lineLayer.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'chen-line double-outer' }))
      lineLayer.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'chen-line double-inner' }))
    } else {
      lineLayer.append(svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'chen-line' }))
    }
  }
  // Cardinality (1 / N): halfway between the diamond's tip and the entity's edge, just above the line
  const label = (from, to, text, entityWidth) => {
    const dx = to.x - from.x, dy = to.y - from.y
    const len = Math.max(1, Math.hypot(dx, dy))
    const ux = Math.abs(dx / len), uy = Math.abs(dy / len)
    const tip = 1 / (ux / 62 + uy / 34) // distance from the diamond's centre to its edge along this line
    const edge = len - (entityWidth / 2) * ux - 22 * uy // distance to the entity's edge along this line
    const at = edge - tip > 26 ? (tip + edge) / 2 : tip + 12
    let px = -dy / len, py = dx / len // a direction at right angles to the line
    if (py > 0) { px = -px; py = -py } // always the upper side, so it never hits the caption below
    const x = from.x + (dx / len) * at + px * 13
    const y = from.y + (dy / len) * at + py * 13
    shapeLayer.append(svgEl('text', { x, y, class: 'chen-card' }, text))
  }
  const entityW = (name) => textWidth(name.toUpperCase(), '600 14px Inter, sans-serif') + 44

  // Relationships: one diamond per foreign key
  const diamondsOf = {} // entity -> diamond points (used to keep attributes out of the way)
  const pairCount = {}
  for (const r of schema.relations) {
    const child = pos[r.from], parent = pos[r.to]
    const pairKey = [r.from, r.to].sort().join('|')
    const k = (pairCount[pairKey] = (pairCount[pairKey] || 0) + 1) - 1
    let d
    if (r.from === r.to) {
      d = { x: child.x, y: child.y - 150 - k * 80 } // self relationship sits above the entity
    } else {
      const dx = parent.x - child.x, dy = parent.y - child.y
      const len = Math.max(1, Math.hypot(dx, dy))
      d = { x: (child.x + parent.x) / 2 - (dy / len) * k * 90, y: (child.y + parent.y) / 2 + (dx / len) * k * 90 }
    }
    const fkColumn = schema.tables.find((t) => t.name === r.from).columns.find((c) => c.name === r.column)
    line(parent, d, false) // parent side: partial participation
    line(child, d, Boolean(fkColumn?.notNull)) // child side: double line when the FK is NOT NULL
    label(d, parent, '1', entityW(r.to))
    label(d, child, 'N', entityW(r.from))

    const diamond = svgEl('g', { class: 'chen-rel' })
    diamond.append(svgEl('polygon', { points: `${d.x},${d.y - 34} ${d.x + 62},${d.y} ${d.x},${d.y + 34} ${d.x - 62},${d.y}` }))
    diamond.append(svgEl('text', { x: d.x, y: d.y + 1 }, 'HAS'))
    diamond.append(svgEl('text', { x: d.x, y: d.y + 50, class: 'chen-caption' }, r.column))
    diamond.append(svgEl('title', {}, `${r.to} (1) has many ${r.from} (N), through ${r.from}.${r.column}`))
    shapeLayer.append(diamond)
    grow(d.x, d.y, 70, 60)
    ;(diamondsOf[r.from] ||= []).push(d)
    ;(diamondsOf[r.to] ||= []).push(d)
  }

  // Entities and their attributes (foreign key columns are shown by the diamond instead)
  for (const table of schema.tables) {
    const c = pos[table.name]
    const attrs = table.columns.filter((col) => !col.fk)
    const arc = freeArc(c, diamondsOf[table.name] || [])
    // Spread the ovals over the free arc; push them further out if they would overlap
    const step = attrs.length > 1 ? Math.min(0.75, arc.span / (attrs.length - 1)) : 0
    const widest = Math.max(0, ...attrs.map((col) => textWidth(col.name) + 36))
    const needed = step ? (widest + 14) / step : 0 // radius at which neighbours just stop touching
    const radius = Math.min(230, Math.max(105, needed))
    const twoRings = needed > 230 // too crowded even then: alternate between two rings
    attrs.forEach((col, i) => {
      const angle = arc.mid + (i - (attrs.length - 1) / 2) * step
      const r = radius + (twoRings && i % 2 ? 60 : 0)
      const p = { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r }
      const rx = textWidth(col.name) / 2 + 18
      line(c, p, false)
      const oval = svgEl('g', { class: 'chen-attr' + (col.pk ? ' key' : '') })
      oval.append(svgEl('ellipse', { cx: p.x, cy: p.y, rx, ry: 18 }))
      oval.append(svgEl('text', { x: p.x, y: p.y + 1 }, col.name))
      oval.append(svgEl('title', {}, `${col.name}: ${col.type}${col.pk ? ' (primary key)' : ''}`))
      shapeLayer.append(oval)
      grow(p.x, p.y, rx + 4, 22)
    })

    const w = textWidth(table.name.toUpperCase(), '600 14px Inter, sans-serif') + 44
    const entity = svgEl('g', { class: 'chen-entity' })
    entity.append(svgEl('rect', { x: c.x - w / 2, y: c.y - 22, width: w, height: 44, rx: 4 }))
    entity.append(svgEl('text', { x: c.x, y: c.y + 1 }, table.name.toUpperCase()))
    shapeLayer.append(entity)
    grow(c.x, c.y, w / 2, 24)
  }

  const pad = 40
  const width = bounds.maxX - bounds.minX + pad * 2
  const height = bounds.maxY - bounds.minY + pad * 2
  svg.setAttribute('viewBox', `${bounds.minX - pad} ${bounds.minY - pad} ${width} ${height}`)
  svg.setAttribute('width', width)
  svg.setAttribute('height', height)

  // Zoom: "Fit" shrinks the picture to the panel width; + / − set an exact size (scroll to move around)
  const box = el('div', 'chen-box')
  const fittedZoom = () => Math.min(1, (document.querySelector('.tab-body').clientWidth - 48) / width)
  const setZoom = (z) => {
    erZoom = z
    svg.style.width = width * z + 'px'
    box.classList.add('zoomed')
  }
  const fit = () => {
    erZoom = null
    svg.style.width = ''
    box.classList.remove('zoomed')
  }
  const zoom = zoomControls(() => erZoom ?? fittedZoom(), setZoom, fit)

  const toolbar = el('div', 'diagram-toolbar')
  toolbar.append(legend([
    ['▭', 'entity (table)'], ['⬭', 'attribute (column)'], ['k̲', 'underlined = primary key'],
    ['◇', 'relationship (foreign key)'], ['═', 'double line = total participation (NOT NULL)'],
  ]), zoom)
  box.append(svg)
  view.replaceChildren(toolbar, box)
  if (erZoom !== null) setZoom(erZoom)
  zoom.show()
}

let erZoom = null // null = fit to the panel
