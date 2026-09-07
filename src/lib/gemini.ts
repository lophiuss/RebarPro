import 'server-only'

// Thin wrapper around Google's Generative Language API (Gemini). Server-only
// — the API key never reaches the browser. Used exclusively by the AI
// Helper feature (src/app/(app)/ai-helper/actions.ts).

export type ChatMessage = { role: 'user' | 'model'; text: string }
export type Effort = 'low' | 'medium' | 'high'

// Gemini's "thinking" models support a "thinking budget" (tokens spent
// reasoning before answering) — but a "pro" model in this family errors on
// budget 0 ("this model only works in thinking mode"), so "low" effort uses
// a minimal-but-nonzero budget rather than fully disabling it.
function thinkingBudgetFor(effort: Effort): number {
  if (effort === 'low') return 1
  if (effort === 'high') return -1 // dynamic — model decides how much to think
  return 1024
}

function supportsThinkingConfig(model: string): boolean {
  return /gemini-(2\.5|3|3\.\d)|flash-latest|pro-latest/.test(model)
}

export async function askGemini(opts: {
  model: string
  effort: Effort
  systemInstruction: string
  messages: ChatMessage[]
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('AI Helper is not configured (missing GEMINI_API_KEY)')

  const body: any = {
    system_instruction: { parts: [{ text: opts.systemInstruction }] },
    contents: opts.messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.2 },
  }
  if (supportsThinkingConfig(opts.model)) {
    body.generationConfig.thinkingConfig = { thinkingBudget: thinkingBudgetFor(opts.effort) }
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${res.status})`)
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''
  if (!text) {
    const finishReason = data?.candidates?.[0]?.finishReason
    throw new Error(finishReason ? `No answer returned (${finishReason})` : 'No answer returned')
  }
  return text
}
