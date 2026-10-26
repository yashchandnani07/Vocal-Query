// db.js : the ONLY file that talks to Postgres (Neon).
// Every SQL query the app uses lives in the sql/ folder; this file just loads and runs them.
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const SQL_DIR = path.join(import.meta.dirname, 'sql')
const HISTORY_FILE = path.join(SQL_DIR, 'history', 'generated_queries.sql')
const MAX_ROWS = 200

// A pool keeps a few connections open and reuses them (DATABASE_URL is Neon's pooled URL).
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 })

// On Vercel, let the platform close idle connections before it pauses the function.
if (process.env.VERCEL) {
  const { attachDatabasePool } = await import('@vercel/functions')
  attachDatabasePool(pool)
}

// Read a .sql file from the sql/ folder, e.g. readSql('app/list_columns.sql')
function readSql(file) {
  return fs.readFileSync(path.join(SQL_DIR, file), 'utf8')
}

// 1. On server start: make sure the voice_log table exists.
export async function setupLogTable() {
  await pool.query(readSql('03_create_log_table.sql'))
}

// 2. "Load demo database": drop, create, insert.
export async function loadDemo() {
  await runScript(
    readSql('00_drop_tables.sql') + readSql('01_create_tables.sql') + readSql('02_insert_sample_data.sql'),
  )
}

// 3. "Upload a .sql file": run the whole file inside one transaction (all or nothing).
export async function runScript(sqlText) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sqlText)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// 4. Tables, columns and keys, for the schema view, ER diagram and the AI.
export async function getSchema() {
  const columns = (await pool.query(readSql('app/list_columns.sql'))).rows
  const keys = (await pool.query(readSql('app/list_keys.sql'))).rows

  const tables = []
  for (const col of columns) {
    let table = tables.find((t) => t.name === col.table_name)
    if (!table) {
      table = { name: col.table_name, columns: [] }
      tables.push(table)
    }
    const isKey = (type) =>
      keys.find((k) => k.constraint_type === type && k.table_name === col.table_name && k.column_name === col.column_name)
    const fk = isKey('FOREIGN KEY')
    table.columns.push({
      name: col.column_name,
      type: col.data_type,
      notNull: col.is_nullable === 'NO',
      pk: Boolean(isKey('PRIMARY KEY')),
      fk: fk ? `${fk.references_table}.${fk.references_column}` : null,
    })
  }

  const relations = keys
    .filter((k) => k.constraint_type === 'FOREIGN KEY')
    .map((k) => ({ from: k.table_name, column: k.column_name, to: k.references_table, toColumn: k.references_column }))

  return { tables, relations }
}

// Decide what kind of statement this is before running it.
//   read   -> SELECT: runs straight away, inside a READ ONLY transaction
//   write  -> INSERT / UPDATE / DELETE / CREATE / ALTER: needs the user to confirm
//   danger -> DROP / TRUNCATE / UPDATE or DELETE without WHERE: needs confirm + red warning
export function checkSql(raw) {
  const sql = String(raw || '').trim().replace(/;+\s*$/, '')
  if (!sql) return { ok: false, error: 'The query is empty.' }
  if (hasSemicolonOutsideQuotes(sql)) return { ok: false, error: 'Only one SQL statement at a time, please.' }
  if (/\b(pg_\w+|copy|grant|revoke|dblink)\b/i.test(sql)) return { ok: false, error: 'That command is not allowed here.' }

  const operation = (sql.match(/^\w+/)?.[0] || '').toUpperCase()
  let kind
  if (operation === 'SELECT') kind = 'read'
  else if (operation === 'WITH') kind = /\b(insert|update|delete)\b/i.test(sql) ? 'write' : 'read'
  else if (['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER'].includes(operation)) kind = 'write'
  else if (['DROP', 'TRUNCATE'].includes(operation)) kind = 'danger'
  else return { ok: false, error: `${operation || 'This'} statements are not supported.` }

  if (['UPDATE', 'DELETE'].includes(operation) && !/\bwhere\b/i.test(sql)) kind = 'danger'
  if (kind !== 'read' && /\bvoice_log\b/i.test(sql)) return { ok: false, error: 'voice_log is read-only.' }
  return { ok: true, sql, kind, operation }
}

function hasSemicolonOutsideQuotes(sql) {
  let quote = null
  for (const ch of sql) {
    if (quote) { if (ch === quote) quote = null }
    else if (ch === "'" || ch === '"') quote = ch
    else if (ch === ';') return true
  }
  return false
}

// 5. Run one checked statement (the one Gemini wrote).
export async function runSql(sql, kind) {
  const client = await pool.connect()
  try {
    await client.query(kind === 'read' ? 'BEGIN READ ONLY' : 'BEGIN')
    await client.query("SET LOCAL statement_timeout = '8s'")
    const result = await client.query(sql)
    await client.query('COMMIT')
    if (kind === 'read') {
      return {
        columns: result.fields.map((f) => f.name),
        rows: result.rows.slice(0, MAX_ROWS),
        rowCount: result.rows.length,
      }
    }
    return { changed: result.rowCount ?? 0 }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Save what the user said + the SQL into voice_log, and append it to sql/history/generated_queries.sql
export async function logQuery({ said, sql, operation, ok, count }) {
  await pool.query(readSql('app/log_insert.sql'), [said || null, sql, operation, ok ? 'OK' : 'ERROR', count ?? null])

  const time = new Date().toISOString().replace('T', ' ').slice(0, 16)
  const heard = said ? ` | said: "${said.replace(/\s+/g, ' ')}"` : ''
  if (process.env.VERCEL) return // Vercel's disk is read-only; voice_log in Postgres still has everything
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true })
  fs.appendFileSync(HISTORY_FILE, `-- [${time}] ${ok ? 'OK' : 'ERROR'} | ${count ?? 0} rows${heard}\n${sql};\n\n`)
}

// 6. The query log panel.
export async function getLog() {
  return (await pool.query(readSql('app/log_recent.sql'))).rows
}
