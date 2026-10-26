// server.js : the Express web server. Serves the pages in public/ and a small JSON API.
import express from 'express'
import * as db from './db.js'
import { createLiveSession } from './ai.js'
import { requireLogin, login } from './auth.js'

const app = express()
app.use(express.json({ limit: '5mb' })) // 5mb so uploaded .sql files fit
app.use(express.static('public', { extensions: ['html'] })) // /import -> public/import.html

// Password: everything under /api needs the login cookie, except /api/login
app.post('/api/login', login)
app.use('/api', requireLogin)

// On Vercel the server has no "start" moment, so make sure voice_log exists on the first API call.
let logTableReady = false
app.use('/api', async (req, res, next) => {
  if (!logTableReady) {
    await db.setupLogTable()
    logTableReady = true
  }
  next()
})

// Load the demo database (customers, products, orders)
app.post('/api/demo', async (req, res) => {
  await db.loadDemo()
  res.json({ ok: true })
})

// Run an uploaded .sql file
app.post('/api/import', async (req, res) => {
  const sql = String(req.body.sql || '')
  if (!sql.trim()) return res.status(400).json({ error: 'The file is empty.' })
  await db.runScript(sql)
  res.json({ ok: true })
})

// Tables, columns and relationships
app.get('/api/schema', async (req, res) => {
  res.json(await db.getSchema())
})

// Start a voice session: returns a one-time Gemini Live token + setup message
app.post('/api/live-session', async (req, res) => {
  const schema = await db.getSchema()
  res.json(await createLiveSession(schema))
})

// Run one SQL statement written by Gemini (or by the user)
// body: { sql, said, confirmed }
app.post('/api/run', async (req, res) => {
  const check = db.checkSql(req.body.sql)
  if (!check.ok) return res.status(400).json({ error: check.error })

  // Changes only run after the user confirmed them
  if (check.kind !== 'read' && !req.body.confirmed) {
    return res.json({ needsConfirmation: true, kind: check.kind, operation: check.operation, sql: check.sql })
  }

  const entry = { said: req.body.said, sql: check.sql, operation: check.operation }
  try {
    const result = await db.runSql(check.sql, check.kind)
    await db.logQuery({ ...entry, ok: true, count: result.rowCount ?? result.changed })
    res.json({ kind: check.kind, operation: check.operation, sql: check.sql, ...result })
  } catch (err) {
    await db.logQuery({ ...entry, ok: false, count: 0 })
    res.status(400).json({ error: err.message, sql: check.sql })
  }
})

// Last 20 entries of voice_log
app.get('/api/log', async (req, res) => {
  res.json({ rows: await db.getLog() })
})

// Any error thrown above ends up here and is sent back as { error }
app.use((err, req, res, next) => {
  console.error(err.message)
  res.status(500).json({ error: err.message })
})

// On Vercel the app is exported and Vercel runs it; on your laptop we start our own server.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000
  await db.setupLogTable()
  app.listen(PORT, () => console.log(`Vocal Query running on http://localhost:${PORT}`))
}

export default app
