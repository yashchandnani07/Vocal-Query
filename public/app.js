// app.js : the workspace page. Schema cards, ER diagram, query log and the results drawer.
// voice.js (loaded after this file) uses showResults(), loadSchema() and refreshLog().

let schema = { tables: [], relations: [] }
let currentTab = 'schema'

// ---------- Small helpers ----------

// Build an element: el('div', 'class-name', 'text'). Text is set with textContent so it is always safe.
function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined && text !== null) node.textContent = text
  return node
}

async function getJson(url) {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// Colour class for a data type chip (integer = blue, text = green, ...).
function typeClass(type) {
  if (/int|serial|numeric|decimal|real|double/.test(type)) return 'chip-blue'
  if (/char|text|uuid/.test(type)) return 'chip-green'
  if (/date|time/.test(type)) return 'chip-amber'
  return 'chip-purple'
}

function formatCell(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ---------- Tabs ----------

function openTab(name) {
  currentTab = name
  document.querySelectorAll('.tab, .rail-btn[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name)
  })
  for (const view of ['schema', 'er', 'log']) {
    document.getElementById('view-' + view).hidden = view !== name
  }
  if (name === 'er') renderEr()
  if (name === 'log') refreshLog()
}

// ---------- Schema ----------

async function loadSchema() {
  try {
    schema = await getJson('/api/schema')
  } catch (err) {
    schema = { tables: [], relations: [] }
    console.error(err)
  }
  renderSidebar()
  renderSchema()
  if (currentTab === 'er') renderEr()
}

function renderSidebar() {
  const list = document.getElementById('table-list')
  list.replaceChildren()
  for (const table of schema.tables) {
    const item = el('li', 'table-item')
    item.append(el('span', 'table-name', table.name), el('span', 'table-meta', table.columns.length + ' cols'))
    item.onclick = () => showTableCard(table.name)
    list.append(item)
  }
  if (schema.tables.length === 0) list.append(el('li', 'muted small', 'No tables yet'))
}

// Click on a table in the sidebar: go to the Schema tab and scroll to its card.
function showTableCard(name) {
  openTab('schema')
  const card = document.getElementById('table-' + name)
  if (!card) return
  card.scrollIntoView({ behavior: 'smooth', block: 'start' })
  card.classList.add('flash')
  setTimeout(() => card.classList.remove('flash'), 1200)
}

function renderSchema() {
  const view = document.getElementById('view-schema')
  view.replaceChildren()
  if (schema.tables.length === 0) {
    view.append(emptyState())
    return
  }
  for (const table of schema.tables) view.append(tableCard(table))
}

function emptyState() {
  const box = el('div', 'empty')
  box.append(el('p', 'display empty-title', 'No tables yet'), el('p', 'muted', 'Load the demo database or upload a .sql file to start talking to your data.'))
  const link = el('a', 'btn btn-primary', 'Import a database')
  link.href = '/import'
  box.append(link)
  return box
}

function tableCard(table) {
  const card = el('div', 'card table-card')
  card.id = 'table-' + table.name
  const head = el('div', 'table-card-head')
  head.append(el('strong', '', table.name), el('span', 'muted small', table.columns.length + ' columns'))
  card.append(head)

  for (const col of table.columns) {
    const row = el('div', 'col-row')
    const name = el('span', 'col-name')
    if (col.pk) name.append(keyIcon())
    name.append(el('span', '', col.name))
    row.append(name)
    if (col.fk) row.append(el('span', 'chip chip-link', '→ ' + col.fk))
    row.append(el('span', 'chip ' + typeClass(col.type), col.type))
    card.append(row)
  }
  return card
}

function keyIcon() {
  const icon = el('span', 'key-icon')
  icon.title = 'Primary key'
  icon.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>'
  return icon
}

// ---------- ER diagram (Mermaid) ----------

let mermaidReady = false
let erCounter = 0

// Turn the schema into Mermaid "erDiagram" text.
function buildErText() {
  const lines = ['erDiagram']
  for (const table of schema.tables) {
    lines.push(`  ${table.name} {`)
    for (const col of table.columns) {
      const type = col.type.replace(/\s+/g, '_')
      const mark = col.pk ? ' PK' : col.fk ? ' FK' : ''
      lines.push(`    ${type} ${col.name}${mark}`)
    }
    lines.push('  }')
  }
  for (const r of schema.relations) lines.push(`  ${r.to} ||--o{ ${r.from} : "${r.column}"`)
  return lines.join('\n')
}

async function renderEr() {
  const view = document.getElementById('view-er')
  if (schema.tables.length === 0) return view.replaceChildren(emptyState())
  if (!window.mermaid) return view.replaceChildren(el('p', 'muted pad', 'Could not load the diagram library (are you offline?).'))

  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#ffffff', primaryBorderColor: '#d9d9de', primaryTextColor: '#232325',
        lineColor: '#2563eb', secondaryColor: '#eef3ff', tertiaryColor: '#f8f8fa',
        fontFamily: 'Inter, sans-serif', fontSize: '14px',
      },
    })
    mermaidReady = true
  }
  try {
    const { svg } = await mermaid.render('er-svg-' + ++erCounter, buildErText())
    const box = el('div', 'er-box')
    box.innerHTML = svg // svg is generated by mermaid from our own schema text
    view.replaceChildren(box)
  } catch (err) {
    view.replaceChildren(el('p', 'muted pad', 'Could not draw the diagram: ' + err.message))
  }
}

// ---------- Query log ----------

async function refreshLog() {
  const view = document.getElementById('view-log')
  try {
    const { rows } = await getJson('/api/log')
    view.replaceChildren(rows.length ? logTable(rows) : el('p', 'muted pad', 'Nothing here yet. Ask a question to see it logged.'))
  } catch (err) {
    view.replaceChildren(el('p', 'muted pad', 'Could not load the log: ' + err.message))
  }
}

function logTable(rows) {
  const headers = ['Time', 'You said', 'SQL', 'Type', 'Status', 'Rows']
  const table = el('table', 'data-table')
  const headRow = el('tr')
  headers.forEach((h) => headRow.append(el('th', '', h)))
  const thead = el('thead')
  thead.append(headRow)
  table.append(thead)

  const body = el('tbody')
  for (const r of rows) {
    const tr = el('tr')
    const time = new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    tr.append(el('td', 'nowrap muted', time), el('td', '', r.spoken_text || '-'), el('td', 'mono sql-cell', r.generated_sql))
    tr.append(chipCell(r.operation, 'chip-purple'), chipCell(r.status, r.status === 'OK' ? 'chip-green' : 'chip-red'))
    tr.append(el('td', 'nowrap', r.rows_affected ?? '-'))
    body.append(tr)
  }
  table.append(body)
  return table
}

function chipCell(text, className) {
  const td = el('td')
  td.append(el('span', 'chip ' + className, text))
  return td
}

// ---------- Results drawer ----------

// result = { sql, columns, rows, rowCount } for reads, or { sql, changed } for changes.
function showResults(result) {
  document.getElementById('results').hidden = false
  document.getElementById('results-sql').textContent = result.sql
  const isRead = Array.isArray(result.rows)
  const n = isRead ? result.rowCount : result.changed
  document.getElementById('results-count').textContent = `${n} ${n === 1 ? 'row' : 'rows'}${isRead ? '' : ' changed'}`

  const box = document.getElementById('results-table')
  if (!isRead || result.rows.length === 0) {
    box.replaceChildren(el('p', 'muted pad', isRead ? 'No rows returned.' : 'Done.'))
    return
  }
  const table = el('table', 'data-table')
  const headRow = el('tr')
  result.columns.forEach((c) => headRow.append(el('th', '', c)))
  const thead = el('thead')
  thead.append(headRow)
  table.append(thead)
  const body = el('tbody')
  for (const row of result.rows.slice(0, 200)) {
    const tr = el('tr')
    for (const column of result.columns) {
      const value = row[column] // pg returns each row as an object
      tr.append(el('td', value === null ? 'null-cell' : '', formatCell(value)))
    }
    body.append(tr)
  }
  table.append(body)
  box.replaceChildren(table)
}

// ---------- Start ----------

document.querySelectorAll('.tab, .rail-btn[data-tab]').forEach((b) => (b.onclick = () => openTab(b.dataset.tab)))
document.getElementById('refresh-btn').onclick = loadSchema
loadSchema()
