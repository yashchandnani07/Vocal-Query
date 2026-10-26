// scripts/check.js : "npm run build". There is nothing to compile (plain JS),
// so the build just checks every .js file for syntax errors and that the SQL files exist.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const files = ['server.js', 'db.js', 'ai.js', ...fs.readdirSync('public').filter((f) => f.endsWith('.js')).map((f) => `public/${f}`)]
for (const file of files) {
  execFileSync(process.execPath, ['--check', file])
  console.log('ok  ', file)
}
const sqlFiles = ['00_drop_tables.sql', '01_create_tables.sql', '02_insert_sample_data.sql', '03_create_log_table.sql',
  'app/list_columns.sql', 'app/list_keys.sql', 'app/log_insert.sql', 'app/log_recent.sql']
for (const file of sqlFiles) {
  if (!fs.existsSync(`sql/${file}`)) throw new Error(`missing sql/${file}`)
  console.log('ok  ', `sql/${file}`)
}
console.log(`\nBuild passed: ${files.length} JS files, ${sqlFiles.length} SQL files.`)
