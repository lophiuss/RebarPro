// One-time setup: obtains a Google Drive refresh token for the security
// department's photo storage. Run this once locally:
//
//   node scripts/google-drive-auth.mjs
//
// It needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already in .env.local
// (from a Google Cloud OAuth client, "Desktop app" type — see the setup
// steps you were given alongside this script). It opens a browser tab, you
// approve access, and Google redirects back to a tiny local server this
// script starts on http://localhost:53682 to catch the one-time code. It
// then prints a GOOGLE_REFRESH_TOKEN line to add to .env.local (and later,
// Vercel's environment variables) — that's the only long-lived secret.
import { google } from 'googleapis'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const content = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {}
}
loadEnvLocal()

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local — add those first, from your Google Cloud OAuth client.')
  process.exit(1)
}

const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // forces a refresh_token even if you've authorized this app before
  scope: ['https://www.googleapis.com/auth/drive'],
})

console.log(`\nMake sure ${REDIRECT_URI} is added as an "Authorized redirect URI" on this OAuth client in Google Cloud Console (APIs & Services -> Credentials), then:\n`)
console.log('1. Open this URL in your browser and sign in with the Google account whose Drive you want to use:\n')
console.log(authUrl)
console.log('\n2. Approve access. Your browser will redirect to localhost and this script will pick it up automatically.\n')
console.log('Waiting for you to approve in the browser...')

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI)
    if (url.pathname !== '/oauth2callback') { res.end('OK'); return }
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    res.setHeader('Content-Type', 'text/html')
    res.end(error
      ? `<h2>Authorization failed: ${error}</h2>You can close this tab.`
      : '<h2>Authorized.</h2>You can close this tab and return to the terminal.')
    server.close()
    if (error) reject(new Error(error)); else resolve(code)
  })
  server.listen(PORT)
})

const { tokens } = await oauth2Client.getToken(code)
if (!tokens.refresh_token) {
  console.error('\nNo refresh token returned. This usually means this Google account already granted access before without "prompt: consent" taking effect — revoke access at https://myaccount.google.com/permissions for this app and try again.')
  process.exit(1)
}

console.log('\nSuccess. Add this line to .env.local (and later to Vercel\'s environment variables):\n')
console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
console.log('\nKeep it secret — treat it like a password. It never expires unless you revoke access.')
