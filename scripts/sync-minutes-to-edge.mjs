// Copies the shared minutes builder next to the send-meeting-summary edge
// function (Deno needs explicit .ts extensions), so the e-mail is built from the
// exact same code as the on-screen preview. Run before deploying the function:
//   node scripts/sync-minutes-to-edge.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const dest = 'supabase/functions/send-meeting-summary'
mkdirSync(dest, { recursive: true })
for (const f of ['meetings', 'richtext', 'minutesHtml']) {
  const src = readFileSync(`src/lib/${f}.ts`, 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'")
  writeFileSync(`${dest}/${f}.ts`, `// GENERATED from src/lib/${f}.ts by scripts/sync-minutes-to-edge.mjs. Do not edit here.\n${src}`)
}
console.log('synced')
