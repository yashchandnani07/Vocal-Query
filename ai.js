// ai.js : everything about Gemini Live.
// The browser talks to Gemini directly over a WebSocket (fast, real-time voice),
// but it never sees our API key: we give it a short-lived, single-use token instead.

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live'

// The tools Gemini is allowed to call. The browser runs them through our /api/run route.
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'run_sql',
        description:
          'Run ONE PostgreSQL statement on the user database. SELECTs run immediately and return rows. ' +
          'INSERT/UPDATE/DELETE/CREATE/ALTER/DROP are NOT run yet: they return needs_confirmation.',
        parameters: {
          type: 'OBJECT',
          properties: {
            sql: { type: 'STRING', description: 'One PostgreSQL statement, no trailing semicolon.' },
            reason: { type: 'STRING', description: 'Very short note on what the query does.' },
          },
          required: ['sql'],
        },
      },
      {
        name: 'confirm_pending_sql',
        description: 'The user said yes: run the change that is waiting for confirmation.',
      },
      {
        name: 'cancel_pending_sql',
        description: 'The user said no: throw away the change that is waiting for confirmation.',
      },
    ],
  },
]

function describeSchema(schema) {
  if (schema.tables.length === 0) return '(the database has no tables yet)'
  return schema.tables
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name} ${c.type}${c.pk ? ' PK' : ''}${c.fk ? ` FK->${c.fk}` : ''}`)
      return `${t.name}(${cols.join(', ')})`
    })
    .join('\n')
}

function systemPrompt(schema) {
  return `You are Vocal Query, a friendly voice assistant that controls a PostgreSQL database for a student's DBMS lab.

Database schema:
${describeSchema(schema)}

How to work:
- To answer anything about the data, call run_sql. Never guess or invent numbers.
- Write exactly one PostgreSQL statement per call. Use only the tables and columns above.
- Add LIMIT 50 when listing rows. Use clear aliases like total_orders.
- If run_sql returns needs_confirmation, say in one short sentence what will change and ask "Shall I go ahead?".
  Then STOP and wait for the user's answer. Only call confirm_pending_sql after the user clearly says yes
  in a new message. If they refuse, call cancel_pending_sql.
- If a query fails, read the error, fix the SQL and try once more.
- Keep spoken answers short: one or two sentences. Do not read out long tables; the rows are shown on screen,
  so say something like "I found 6 customers, they're on your screen."
- If the request is unclear, ask a short question. Always reply in English.`
}

// Ask Google for a single-use token that is valid for a few minutes,
// and give the browser everything it needs to open the Live session.
export async function createLiveSession(schema) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing in .env')

  const res = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // session may last 30 min
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(), // must connect within 1 min
    }),
  })
  if (!res.ok) throw new Error(`Gemini token request failed (${res.status})`)
  const token = (await res.json()).name

  return {
    url:
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.' +
      `GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`,
    // The first message the browser must send on the WebSocket.
    setup: {
      model: `models/${MODEL}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
      systemInstruction: { parts: [{ text: systemPrompt(schema) }] },
      tools: TOOLS,
      inputAudioTranscription: {}, // send us the text of what the user said
      outputAudioTranscription: {}, // and the text of what Gemini said
    },
  }
}
