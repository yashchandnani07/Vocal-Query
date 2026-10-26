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
  for (const view of ['schema', 'er', 'log', 'dbs']) {
    document.getElementById('view-' + view).hidden = view !== name
  }
  if (name === 'er') renderEr()
  if (name === 'log') refreshLog()
  if (name === 'dbs') refreshDatabases()
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
  card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  card.classList.add('flash')
  setTimeout(() => card.classList.remove('flash'), 1200)
}

// Schema tab: table cards + relationship lines (drawn by diagrams.js)
function renderSchema() {
  const view = document.getElementById('view-schema')
  if (schema.tables.length === 0) return view.replaceChildren(emptyState())
  drawSchemaCanvas(view, schema)
}

function emptyState() {
  const box = el('div', 'empty')
  box.append(el('p', 'display empty-title', 'No tables yet'), el('p', 'muted', 'Load the demo database or upload a .sql file to start talking to your data.'))
  const link = el('a', 'btn btn-primary', 'Import a database')
  link.href = '/import'
  box.append(link)
  return box
}

// ---------- ER diagram ----------

// ER tab: Chen-notation ER diagram (drawn by diagrams.js)
function renderEr() {
  const view = document.getElementById('view-er')
  if (schema.tables.length === 0) return view.replaceChildren(emptyState())
  drawChenEr(view, schema)
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

// ---------- Databases tab (the database table: everything the user loaded or uploaded) ----------

async function refreshDatabases() {
  const view = document.getElementById('view-dbs')
  try {
    const { rows } = await getJson('/api/databases')
    view.replaceChildren(rows.length ? databasesTable(rows) : el('p', 'muted pad', 'No database yet. Load the demo or upload a .sql file on the Import page.'))
  } catch (err) {
    view.replaceChildren(el('p', 'muted pad', 'Could not load the databases: ' + err.message))
  }
}

function databasesTable(rows) {
  const table = el('table', 'data-table')
  const headRow = el('tr')
  ;['ID', 'Name', 'Source', 'File', 'Added', 'Queries'].forEach((h) => headRow.append(el('th', '', h)))
  const thead = el('thead')
  thead.append(headRow)
  table.append(thead)

  const body = el('tbody')
  for (const r of rows) {
    const tr = el('tr')
    const added = new Date(r.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    tr.append(el('td', 'nowrap muted', r.id), el('td', '', r.name))
    tr.append(chipCell(r.source, r.source === 'upload' ? 'chip-blue' : 'chip-purple'))
    tr.append(el('td', 'mono', r.file_name || '-'), el('td', 'nowrap muted', added), el('td', 'nowrap', r.queries))
    body.append(tr)
  }
  table.append(body)
  return table
}

function logTable(rows) {
  const headers = ['Time', 'Database', 'You said', 'SQL', 'Type', 'Status', 'Rows']
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
    tr.append(el('td', 'nowrap muted', time), el('td', 'nowrap', r.database_name || '-'), el('td', '', r.spoken_text || '-'), el('td', 'mono sql-cell', r.generated_sql))
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
