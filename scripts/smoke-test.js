// scripts/smoke-test.js : "npm test". Starts the server and checks every part end to end:
// Neon Postgres (demo load, schema, read, confirm-before-write, log) and Gemini Live (token + tool call + voice).
import { spawn } from 'node:child_process'

const PORT = 3999
const BASE = `http://localhost:${PORT}`
let failures = 0

function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ->  ' + detail : ''}`)
  if (!condition) failures++
}

async function api(path, body) {
  const res = await fetch(BASE + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {})
  return res.json()
}

// Start the real server
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((resolve) => server.stdout.on('data', (d) => d.toString().includes('running') && resolve()))

try {
  // --- Neon Postgres ---
  check('POST /api/demo loads demo tables', (await api('/api/demo', {})).ok === true)

  const schema = await api('/api/schema')
  check('GET /api/schema has 3 tables', schema.tables.length === 3, schema.tables.map((t) => t.name).join(', '))
  check('foreign keys found for ER diagram', schema.relations.length === 2,
    schema.relations.map((r) => `${r.from}.${r.column} -> ${r.to}`).join(', '))

  const read = await api('/api/run', { sql: 'SELECT COUNT(*) AS total FROM customers', said: 'smoke test count' })
  check('SELECT runs immediately', read.rows?.[0]?.total === '6', JSON.stringify(read.rows))

  const pending = await api('/api/run', { sql: 'DELETE FROM orders WHERE id = 1' })
  check('DELETE waits for confirmation', pending.needsConfirmation === true)

  const danger = await api('/api/run', { sql: 'DELETE FROM orders' })
  check('DELETE without WHERE is flagged danger', danger.kind === 'danger')

  const done = await api('/api/run', { sql: 'DELETE FROM orders WHERE id = 1', confirmed: true, said: 'smoke test delete' })
  check('confirmed DELETE runs', done.changed === 1)

  const blocked = await api('/api/run', { sql: 'SELECT 1; DROP TABLE customers' })
  check('two statements are blocked', Boolean(blocked.error), blocked.error)

  const log = await api('/api/log')
  check('voice_log saved the commands', log.rows[0]?.spoken_text === 'smoke test delete', `${log.rows.length} rows`)

  // --- Gemini Live ---
  const live = await api('/api/live-session', {})
  check('POST /api/live-session returns token URL', live.url?.startsWith('wss://'))

  const result = await new Promise((resolve) => {
    const ws = new WebSocket(live.url)
    const out = { toolSql: null, audioBytes: 0, said: '' }
    const timer = setTimeout(() => { ws.close(); resolve(out) }, 45000)
    ws.onopen = () => ws.send(JSON.stringify({ setup: live.setup }))
    ws.onmessage = async (event) => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text())
      if (msg.setupComplete) ws.send(JSON.stringify({ realtimeInput: { text: 'How many products are there?' } }))
      if (msg.toolCall) {
        const call = msg.toolCall.functionCalls[0]
        out.toolSql = call.args.sql
        const rows = await api('/api/run', { sql: call.args.sql, said: 'smoke test live' })
        ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: rows }] } }))
      }
      for (const part of msg.serverContent?.modelTurn?.parts || []) out.audioBytes += part.inlineData?.data.length || 0
      out.said += msg.serverContent?.outputTranscription?.text || ''
      if (msg.serverContent?.turnComplete && out.audioBytes > 0) { clearTimeout(timer); ws.close(); resolve(out) }
    }
  })
  check('Gemini Live called run_sql', Boolean(result.toolSql), result.toolSql)
  check('Gemini Live answered with voice audio', result.audioBytes > 0, `${result.audioBytes} base64 chars`)
  check('Gemini Live transcript', result.said.length > 0, result.said.trim())

  await api('/api/demo', {}) // put the demo data back
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
