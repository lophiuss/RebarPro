import 'server-only'

// Thin wrapper around Google's Generative Language API (Gemini), with tool
// (function) calling support — Server-only, the API key never reaches the
// browser. Used exclusively by the AI Helper feature (src/app/(app)/ai-helper).

export type ChatMessage = { role: 'user' | 'model'; text: string }
export type Effort = 'low' | 'medium' | 'high'

export type FunctionDeclaration = {
  name: string
  description: string
  parameters: Record<string, any>
}

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

async function callGenerateContent(model: string, body: any): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('AI Helper is not configured (missing GEMINI_API_KEY)')

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Gemini request failed (${res.status})`)
  return data
}

// Runs Gemini with tool calling: the model decides which tool calls (if any)
// it needs, we execute them via `executeTool`, feed the results back, and
// repeat until it gives a final text answer or `maxTurns` is hit. This is
// how the model looks at real, live data itself rather than being handed a
// pre-built snapshot — each tool call is a real query run at that moment.
export type GeminiUsage = { promptTokens: number; completionTokens: number; totalTokens: number }
export type GeminiResult = { text: string; usage: GeminiUsage }

export async function askGeminiWithTools(opts: {
  model: string
  effort: Effort
  systemInstruction: string
  messages: ChatMessage[]
  tools: FunctionDeclaration[]
  executeTool: (name: string, args: any) => Promise<any>
  maxTurns?: number
}): Promise<GeminiResult> {
  const generationConfig: any = { temperature: 0.2 }
  if (supportsThinkingConfig(opts.model)) {
    generationConfig.thinkingConfig = { thinkingBudget: thinkingBudgetFor(opts.effort) }
  }

  const contents: any[] = opts.messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }))
  const maxTurns = opts.maxTurns ?? 6

  // A tool-calling exchange is several generateContent calls (one per
  // turn) — usage is summed across all of them so the logged figure is the
  // true cost of one user question, not just its final turn.
  const usage: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  function addUsage(data: any) {
    const u = data?.usageMetadata
    if (!u) return
    usage.promptTokens += u.promptTokenCount || 0
    usage.completionTokens += u.candidatesTokenCount || 0
    usage.totalTokens += u.totalTokenCount || 0
  }

  for (let turn = 0; turn < maxTurns; turn++) {
    const data = await callGenerateContent(opts.model, {
      system_instruction: { parts: [{ text: opts.systemInstruction }] },
      contents,
      tools: [{ functionDeclarations: opts.tools }],
      generationConfig,
    })
    addUsage(data)

    const candidate = data?.candidates?.[0]
    const parts: any[] = candidate?.content?.parts || []
    const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall)

    if (functionCalls.length === 0) {
      const text = parts.map(p => p.text || '').join('')
      if (text) return { text, usage }
      const finishReason = candidate?.finishReason
      throw new Error(finishReason ? `No answer returned (${finishReason})` : 'No answer returned')
    }

    // Record the model's turn (its tool call requests), then run each tool
    // and feed the results back as the next turn.
    contents.push({ role: 'model', parts })
    const responseParts = []
    for (const call of functionCalls) {
      let result: any
      try {
        result = await opts.executeTool(call.name, call.args || {})
      } catch (err: any) {
        result = { error: String(err?.message || err) }
      }
      responseParts.push({ functionResponse: { name: call.name, response: { result } } })
    }
    contents.push({ role: 'user', parts: responseParts })
  }

  throw new Error('Reached the maximum number of tool-call steps without a final answer.')
}
