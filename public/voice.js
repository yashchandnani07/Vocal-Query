// voice.js : talks to Gemini Live (WebSocket), the microphone, the speaker and the chat panel.
// Needs el(), showResults(), loadSchema(), refreshLog() from app.js.

const $ = (id) => document.getElementById(id)
const STATUS_TEXT = { idle: 'Tap to talk', connecting: 'Connecting...', listening: 'Listening...', thinking: 'Thinking...', speaking: 'Speaking...' }

let ws = null // the Gemini Live WebSocket
let ready = false // true after setupComplete
let queuedText = null // typed text waiting for the session to open
let micOn = false
let micCtx = null, micStream = null, micNode = null
let outCtx = null, outAnalyser = null, nextStart = 0
const playing = new Set() // audio sources that are scheduled or playing
let level = 0 // 0..1 loudness shown by the orb
let pendingSql = null // { sql, kind, operation, card } waiting for the user's OK
let userReplied = false // did the user say or type anything since the confirm card appeared?
let lastSaid = '' // what the user last said, saved in the query log
let userBubble = null, botBubble = null // live transcript bubbles of the current turn

// ---------- Orb and status ----------

function setOrb(state) {
  $('orb').className = 'orb ' + state
  $('orb-status').textContent = STATUS_TEXT[state]
}

// The state the orb returns to when nothing is happening.
function restState() {
  setOrb(micOn ? 'listening' : 'idle')
}

function setConnection(online) {
  $('conn-status').classList.toggle('online', online)
  $('conn-text').textContent = online ? 'Live' : 'Offline'
}

// Every animation frame: pick the loudness (mic or speaker) and give it to the CSS.
function animateOrb() {
  if (!ws) return $('orb').style.setProperty('--level', 0)
  if (playing.size > 0 && outAnalyser) {
    const data = new Uint8Array(outAnalyser.fftSize)
    outAnalyser.getByteTimeDomainData(data)
    level = Math.sqrt(data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length) * 4
  }
  $('orb').style.setProperty('--level', Math.min(level, 1).toFixed(2))
  level *= 0.85 // fade out between mic frames
  requestAnimationFrame(animateOrb)
}

// ---------- Chat bubbles ----------

function addToChat(node) {
  $('hint').hidden = true
  $('messages').append(node)
  $('messages').scrollTop = $('messages').scrollHeight
  return node
}

function addBubble(role, text) {
  return addToChat(el('div', 'bubble ' + role, text))
}

function addNote(text) {
  return addToChat(el('div', 'note', text))
}

// Add a piece of live transcript to a bubble, creating the bubble on the first piece.
function appendTranscript(role, text) {
  const isUser = role === 'user'
  let bubble = isUser ? userBubble : botBubble
  if (!bubble) {
    bubble = addBubble(role, '')
    if (isUser) userBubble = bubble
    else botBubble = bubble
  }
  bubble.textContent += text
  if (isUser) {
    lastSaid = bubble.textContent.trim()
    userReplied = true
  }
  $('messages').scrollTop = $('messages').scrollHeight
}

// Chat card showing a SQL statement with an operation chip and a row count.
function addSqlCard(sql, operation, countText, chipClass) {
  const card = el('div', 'card sql-card')
  const head = el('div', 'sql-card-head')
  head.append(el('span', 'chip ' + (chipClass || 'chip-purple'), operation), el('span', 'muted small', countText || ''))
  card.append(head, el('pre', 'sql-code', sql))
  return addToChat(card)
}

// ---------- Running SQL (the 3 tools) ----------

async function callRun(sql, confirmed) {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, said: lastSaid, confirmed }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Query failed')
  return data
}

function showError(message, sql) {
  const card = sql ? addSqlCard(sql, 'ERROR', '', 'chip-red') : addToChat(el('div', 'card sql-card'))
  card.append(el('p', 'error-text', message))
}

// Tool: run_sql
async function toolRunSql(args) {
  try {
    const data = await callRun(args.sql, false)
    if (data.needsConfirmation) return askToConfirm(data)
    showResults(data)
    addSqlCard(data.sql, data.operation, `${data.rowCount} ${data.rowCount === 1 ? 'row' : 'rows'}`)
    return { rowCount: data.rowCount, columns: data.columns, rows: data.rows.slice(0, 20) }
  } catch (err) {
    showError(err.message, args.sql)
    return { error: err.message }
  }
}

// A change is waiting: show a confirm card with Confirm / Cancel buttons.
function askToConfirm(data) {
  if (pendingSql) pendingSql.card.classList.add('done') // an older pending change is replaced
  const danger = data.kind === 'danger'
  const card = el('div', 'card sql-card confirm-card ' + (danger ? 'is-danger' : 'is-write'))
  const head = el('div', 'sql-card-head')
  head.append(el('span', 'chip ' + (danger ? 'chip-red' : 'chip-amber'), danger ? 'Danger' : 'Needs your OK'), el('span', 'muted small', data.operation))
  card.append(head, el('pre', 'sql-code', data.sql))
  if (danger) card.append(el('p', 'error-text', dangerNote(data)))

  const buttons = el('div', 'confirm-buttons')
  const confirmBtn = el('button', danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm', 'Confirm')
  const cancelBtn = el('button', 'btn btn-secondary btn-sm', 'Cancel')
  confirmBtn.onclick = () => clickConfirm(true)
  cancelBtn.onclick = () => clickConfirm(false)
  buttons.append(confirmBtn, cancelBtn)
  card.append(buttons)
  addToChat(card)

  pendingSql = { sql: data.sql, kind: data.kind, operation: data.operation, card }
  userReplied = false
  return { status: 'needs_confirmation', operation: data.operation, message: 'Not run yet. Ask the user to confirm.' }
}

function dangerNote(data) {
  if (data.operation === 'DROP' || data.operation === 'TRUNCATE') return 'This permanently removes data and cannot be undone.'
  return 'No WHERE - affects every row.'
}

// Close the confirm card and replace its buttons with the final status.
function finishCard(card, text, className) {
  card.querySelector('.confirm-buttons')?.remove()
  card.classList.add('done')
  card.append(el('p', 'card-status ' + className, text))
}

// Tool: confirm_pending_sql (also used by the Confirm button)
async function toolConfirm() {
  if (!pendingSql) return { error: 'There is nothing waiting for confirmation.' }
  const { sql, card } = pendingSql
  pendingSql = null
  try {
    const data = await callRun(sql, true)
    showResults(data)
    finishCard(card, `Done: ${data.changed} ${data.changed === 1 ? 'row' : 'rows'} changed`, 'ok-text')
    await loadSchema() // new counts, and new tables for CREATE / ALTER / DROP
    if (!$('view-log').hidden) refreshLog()
    return { status: 'done', operation: data.operation, changed: data.changed }
  } catch (err) {
    finishCard(card, err.message, 'error-text')
    return { error: err.message }
  }
}

// Tool: cancel_pending_sql (also used by the Cancel button)
function toolCancel() {
  if (!pendingSql) return { status: 'cancelled' }
  finishCard(pendingSql.card, 'Cancelled', 'muted')
  pendingSql = null
  return { status: 'cancelled' }
}

// The user clicked a button instead of speaking: do it, then tell Gemini so it can say the result.
async function clickConfirm(yes) {
  const result = yes ? await toolConfirm() : toolCancel()
  let text = '(The user clicked Cancel.)'
  if (yes) text = result.error ? `(The user clicked Confirm. It failed: ${result.error})` : `(The user clicked Confirm. Result: ${result.changed} rows changed.)`
  if (ready) {
    setOrb('thinking')
    send({ realtimeInput: { text } })
  }
}

// Gemini asked for one or more tool calls: run each and send the answers back.
async function handleToolCall(calls) {
  setOrb('thinking')
  const responses = []
  for (const call of calls) {
    let response
    if (call.name === 'run_sql') response = await toolRunSql(call.args || {})
    else if (call.name === 'confirm_pending_sql') response = userReplied ? await toolConfirm() : { error: 'The user has not answered yet. Ask them and wait for their reply.' }
    else if (call.name === 'cancel_pending_sql') response = toolCancel()
    else response = { error: 'Unknown tool ' + call.name }
    responses.push({ id: call.id, name: call.name, response })
  }
  send({ toolResponse: { functionResponses: responses } })
}

// ---------- WebSocket session ----------

function send(message) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

// Open a Live session. withMic = start the microphone as soon as it is ready.
async function openSession(withMic) {
  setOrb('connecting')
  try {
    outCtx = new AudioContext({ sampleRate: 24000 }) // created inside the click, so the browser allows sound
    outAnalyser = outCtx.createAnalyser()
    outAnalyser.connect(outCtx.destination)
    const res = await fetch('/api/live-session', { method: 'POST' }) // new single-use token every time
    const session = await res.json()
    if (!res.ok) throw new Error(session.error || 'Could not start a session')

    ws = new WebSocket(session.url)
    ws.onopen = () => ws.send(JSON.stringify({ setup: session.setup }))
    ws.onmessage = (e) => handleMessage(e, withMic)
    ws.onerror = () => addNote('Connection problem with Gemini.')
    ws.onclose = (e) => closeSession(e.code === 1000 || e.code === 1005 ? '' : e.reason || 'The session ended.')
    requestAnimationFrame(animateOrb)
  } catch (err) {
    closeSession(err.message)
  }
}

// Everything Gemini sends us arrives here.
async function handleMessage(e, withMic) {
  const msg = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text())

  if (msg.setupComplete) {
    ready = true
    setConnection(true)
    restState()
    if (withMic) startMic()
    if (queuedText) {
      send({ realtimeInput: { text: queuedText } })
      queuedText = null
      setOrb('thinking')
    }
  }
  if (msg.toolCall) handleToolCall(msg.toolCall.functionCalls)

  const content = msg.serverContent
  if (!content) return
  if (content.interrupted) stopPlayback() // the user started talking over Gemini
  if (content.inputTranscription) {
    botBubble = null // a new user turn started
    appendTranscript('user', content.inputTranscription.text)
  }
  if (content.outputTranscription) appendTranscript('assistant', content.outputTranscription.text)
  for (const part of content.modelTurn?.parts || []) {
    if (part.inlineData?.data) playChunk(part.inlineData.data)
  }
  if (content.turnComplete) {
    userBubble = null
    botBubble = null
    if (playing.size === 0) restState()
  }
}

// Stop everything: mic, speaker, WebSocket. message = why (shown in chat), or '' for a normal close.
function closeSession(message) {
  if (message) addNote(message)
  stopMic()
  stopPlayback()
  if (ws) {
    ws.onclose = null
    ws.close()
  }
  outCtx?.close().catch(() => {})
  ws = outCtx = outAnalyser = null
  ready = false
  queuedText = null
  userBubble = botBubble = null
  setConnection(false)
  setOrb('idle')
}

// ---------- Microphone ----------

async function startMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    micCtx = new AudioContext({ sampleRate: 16000 })
    await micCtx.audioWorklet.addModule('/mic-worklet.js')
    micNode = new AudioWorkletNode(micCtx, 'mic-processor')
    micCtx.createMediaStreamSource(micStream).connect(micNode)

    let buffer = []
    micNode.port.onmessage = (e) => {
      buffer.push(...e.data)
      if (buffer.length >= 1600) { // 1600 samples = 100 ms at 16 kHz
        sendMicChunk(buffer)
        buffer = []
      }
    }
    micOn = true
    $('mic-note').textContent = ''
    if (playing.size === 0) setOrb('listening')
  } catch (err) {
    stopMic()
    $('mic-note').textContent = 'Microphone not available. You can still type.'
    if (!ready) closeSession('')
    else restState()
  }
}

// Float32 samples (-1..1) -> 16-bit PCM -> base64, then send to Gemini.
function sendMicChunk(samples) {
  const pcm = new Int16Array(samples.length)
  let sum = 0
  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s))
    pcm[i] = clamped * 32767
    sum += clamped * clamped
  })
  if (playing.size === 0) level = Math.max(level, Math.sqrt(sum / samples.length) * 6)
  send({ realtimeInput: { audio: { data: toBase64(pcm.buffer), mimeType: 'audio/pcm;rate=16000' } } })
}

function stopMic() {
  micNode?.disconnect()
  micStream?.getTracks().forEach((t) => t.stop())
  micCtx?.close().catch(() => {})
  micNode = micStream = micCtx = null
  micOn = false
}

// ---------- Speaker ----------

function playChunk(base64) {
  if (!outCtx) return
  const pcm = new Int16Array(fromBase64(base64))
  const buffer = outCtx.createBuffer(1, pcm.length, 24000)
  const floats = buffer.getChannelData(0)
  for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 32768

  const source = outCtx.createBufferSource()
  source.buffer = buffer
  source.connect(outAnalyser)
  const startAt = Math.max(nextStart, outCtx.currentTime) // play right after the previous chunk
  source.start(startAt)
  nextStart = startAt + buffer.duration

  playing.add(source)
  source.onended = () => {
    playing.delete(source)
    if (playing.size === 0 && ws) restState()
  }
  setOrb('speaking')
}

function stopPlayback() {
  playing.forEach((s) => { s.onended = null; try { s.stop() } catch (e) { /* already stopped */ } })
  playing.clear()
  nextStart = 0
  if (ws) restState()
}

// ---------- base64 helpers ----------

function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text)
}

function fromBase64(base64) {
  const text = atob(base64)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes.buffer
}

// ---------- Buttons ----------

// Orb: connect + listen, or hang up.
$('orb').onclick = () => {
  if (micOn) return closeSession('')
  if (ws && ready) return startMic() // text session is open: add the microphone
  if (ws) return closeSession('') // still connecting: cancel
  openSession(true)
}

// Typed message (Enter sends, Shift+Enter makes a new line).
function sendTyped() {
  const input = $('composer-input')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  userBubble = null
  addBubble('user', text)
  lastSaid = text
  userReplied = true
  if (ready) {
    send({ realtimeInput: { text } })
    setOrb('thinking')
  } else if (ws) {
    queuedText = text // session is still opening
  } else {
    queuedText = text
    openSession(false)
  }
}

$('composer').onsubmit = (e) => { e.preventDefault(); sendTyped() }
$('composer-input').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTyped() }
}

document.querySelectorAll('.example').forEach((btn) => {
  btn.onclick = () => { $('composer-input').value = btn.textContent; sendTyped() }
})
