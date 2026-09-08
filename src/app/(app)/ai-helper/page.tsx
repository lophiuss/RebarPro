'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Settings as SettingsIcon, X, UserPlus, Trash2, Loader2 } from 'lucide-react'
import {
  askAiHelper, getSettings, updateSettings, amISuperAdmin,
  listAllowedPeople, listAllPeople, grantAccess, revokeAccess, getUsageSummary,
  type Settings, type AllowedPerson, type UsageSummary,
} from './actions'

type Msg = { role: 'user' | 'model'; text: string }

// "-latest" aliases rather than pinned dated versions — several dated
// Gemini models were already deprecated for this account by the time this
// was built, so an alias that Google keeps pointed at a current model is
// the safer default than a version number that can silently stop working.
const MODEL_OPTIONS = [
  { value: 'gemini-flash-latest', label: 'Gemini Flash (latest) — fast, recommended' },
  { value: 'gemini-pro-latest', label: 'Gemini Pro (latest) — most capable, slower' },
  { value: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite (latest) — fastest, simplest' },
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (pinned version)' },
]

const SUGGESTED_PROMPTS = [
  'Who should we follow up with today, and why?',
  'Which department is at risk right now, and why?',
  'Who hasn’t done their job today?',
  'Generate a summary for yesterday.',
  'Give me a material forecast based on recent usage.',
]

export default function AiHelperPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [allowedPeople, setAllowedPeople] = useState<AllowedPerson[]>([])
  const [allPeople, setAllPeople] = useState<AllowedPerson[]>([])
  const [grantUserId, setGrantUserId] = useState('')
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    amISuperAdmin().then(async admin => {
      setIsSuperAdmin(admin)
      if (admin) {
        const [s, allowed, all, u] = await Promise.all([getSettings(), listAllowedPeople(), listAllPeople(), getUsageSummary()])
        setSettings(s)
        setAllowedPeople(allowed)
        setAllPeople(all)
        setUsage(u)
      }
    })
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  async function send(text?: string) {
    const question = (text ?? input).trim()
    if (!question || sending) return
    const nextMessages: Msg[] = [...messages, { role: 'user', text: question }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    try {
      const reply = await askAiHelper(nextMessages)
      setMessages(prev => [...prev, { role: 'model', text: reply }])
      if (isSuperAdmin) getUsageSummary().then(setUsage).catch(() => {})
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', text: `⚠ ${err.message || 'Something went wrong.'}` }])
    } finally {
      setSending(false)
    }
  }

  async function saveSettings() {
    if (!settings) return
    setSavingSettings(true)
    try {
      await updateSettings(settings)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSavingSettings(false)
    }
  }

  async function doGrant() {
    if (!grantUserId) return
    try {
      await grantAccess(grantUserId)
      setGrantUserId('')
      setAllowedPeople(await listAllowedPeople())
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  async function doRevoke(userId: string) {
    try {
      await revokeAccess(userId)
      setAllowedPeople(prev => prev.filter(p => p.id !== userId))
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
  }

  const grantablePeople = allPeople.filter(p => !allowedPeople.some(a => a.id === p.id))

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col h-[calc(100vh-2rem)] md:h-screen">
      <div className="flex items-center justify-between gap-4 mb-4 flex-shrink-0">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-violet-600" /> AI Helper</h1>
        {isSuperAdmin && (
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-200">
            <SettingsIcon className="w-4 h-4" /> Settings
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4 flex-shrink-0">
        Answers are grounded only in this system's own live data — Rebar, BPlant, and Security, scoped to what your account can see. It won't invent numbers.
      </p>

      <div className="flex-1 bg-white border rounded-xl shadow-sm overflow-y-auto p-4 mb-4 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <Sparkles className="w-10 h-10 text-violet-200 mb-3" />
            <p className="text-sm text-gray-500 mb-4">Ask about today's operations, or try one of these:</p>
            <div className="flex flex-col gap-2 w-full max-w-md">
              {SUGGESTED_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)} className="text-left text-sm bg-violet-50 text-violet-800 border border-violet-100 rounded-lg px-3.5 py-2.5 hover:bg-violet-100">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-slate-800'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); send() }} className="flex gap-2 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about today's operations..."
          className="flex-1 border rounded-xl px-4 py-3 text-sm"
        />
        <button type="submit" disabled={sending || !input.trim()} className="bg-blue-600 disabled:opacity-40 text-white rounded-xl px-4 py-3 hover:bg-blue-700">
          <Send className="w-4 h-4" />
        </button>
      </form>

      {showSettings && settings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> AI Helper Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
            <select value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm bg-white mb-4">
              {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <label className="block text-xs font-medium text-gray-500 mb-1">Effort</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
              {(['low', 'medium', 'high'] as const).map(e => (
                <button key={e} type="button" onClick={() => setSettings({ ...settings, effort: e })}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition ${settings.effort === e ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  {e}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 -mt-3 mb-4">Higher effort thinks longer before answering — better for forecasts/analysis, slower for quick lookups.</p>

            <label className="block text-xs font-medium text-gray-500 mb-1">Custom Instructions <span className="text-gray-400">(optional, added on top of the built-in grounding rules)</span></label>
            <textarea
              value={settings.system_instructions}
              onChange={e => setSettings({ ...settings, system_instructions: e.target.value })}
              rows={3}
              placeholder="e.g. Always answer in Malay. Flag anything security-related first."
              className="w-full border rounded-md px-3 py-2 text-sm mb-4"
            />

            <div className="grid grid-cols-2 gap-3 mb-1">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">$ per 1M input tokens</label>
                <input type="number" step="0.01" min="0" value={settings.price_per_1m_input_tokens}
                  onChange={e => setSettings({ ...settings, price_per_1m_input_tokens: Number(e.target.value) || 0 })}
                  className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">$ per 1M output tokens</label>
                <input type="number" step="0.01" min="0" value={settings.price_per_1m_output_tokens}
                  onChange={e => setSettings({ ...settings, price_per_1m_output_tokens: Number(e.target.value) || 0 })}
                  className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">Set these to match this project's actual Gemini billing rate — used only to turn tracked token counts into the cost estimate below.</p>

            <button onClick={saveSettings} disabled={savingSettings} className="w-full bg-blue-600 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 mb-6">
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>

            {usage && (
              <div className="border-t pt-4 mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-2">Token Usage &amp; Cost (all-time)</h3>
                <div className="grid grid-cols-2 gap-2 text-sm mb-1">
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-xs text-gray-400">Questions asked</div><div className="font-semibold">{usage.callCount.toLocaleString()}</div></div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-xs text-gray-400">Total tokens</div><div className="font-semibold">{usage.totalTokens.toLocaleString()}</div></div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-xs text-gray-400">Input tokens</div><div className="font-semibold">{usage.promptTokens.toLocaleString()}</div></div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-xs text-gray-400">Output tokens</div><div className="font-semibold">{usage.completionTokens.toLocaleString()}</div></div>
                </div>
                <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 mt-2">
                  <div className="text-xs text-violet-500">Estimated cost</div>
                  <div className="font-bold text-violet-800">${usage.estimatedCost.toFixed(4)}</div>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Estimate only — actual token counts × the rates above, not a real-time bill from Google.</p>
              </div>
            )}

            <div className="border-t pt-4">
              <h3 className="text-sm font-bold text-slate-700 mb-2">Who Can Use This</h3>
              <p className="text-xs text-gray-500 mb-3">Admins in any department can always use AI Helper. Add specific people here to let them use it too.</p>
              <div className="flex gap-2 mb-3">
                <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)} className="flex-1 border rounded-md px-3 py-2 text-sm bg-white">
                  <option value="">Select a person…</option>
                  {grantablePeople.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
                <button onClick={doGrant} disabled={!grantUserId} className="flex items-center gap-1 bg-slate-900 disabled:opacity-40 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-800">
                  <UserPlus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="space-y-1.5">
                {allowedPeople.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span>{p.full_name || p.email}</span>
                    <button onClick={() => doRevoke(p.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {allowedPeople.length === 0 && <p className="text-xs text-gray-400 italic">Nobody extra added — only admins can use it right now.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
