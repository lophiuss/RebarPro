import { LifeBuoy } from 'lucide-react'

// Static guidance, written for this app. Each topic is a collapsible card.
const TOPICS: { title: string; body: string[] }[] = [
  {
    title: 'Running a weekly meeting',
    body: [
      'Start the meeting from its page. The leader’s screen drives the agenda, and everyone else follows automatically.',
      'Stay on time: each agenda item shows time used against its plan. A red timer means you are over.',
      'Use Tangent alert when the conversation drifts, then park the topic as an issue and move on.',
      'End on Wrap-up: review new to-dos, rate the meeting 1-10, then Conclude. Concluding saves a summary and archives completed items.',
    ],
  },
  {
    title: 'The agenda, section by section',
    body: [
      'Check-in (5 min): everyone shares good news, one personal and one business. It builds the habit of speaking first.',
      'Quarterly Priorities (5 min): confirm each priority is on or off track. Do not discuss, just report.',
      'KPIs (5 min): review the numbers against target. Red numbers that matter become issues.',
      'Headlines (5 min): one-sentence customer or team news. Anything that needs discussion becomes an issue.',
      'To-dos (5 min): done or not done. Not done means it is carried or dropped, with no storytelling.',
      'Issues (60 min): pick the most important issue first and solve it for good.',
      'Wrap-up (5 min): recap the to-dos, rate the meeting, and conclude.',
    ],
  },
  {
    title: 'Solving issues well',
    body: [
      'Identify: say the real issue in one sentence. Ask “is that the root cause?” until it is.',
      'Discuss: everyone speaks once, briefly, without repeating a point.',
      'Solve: agree on the fix and turn it into a to-do with an owner and a 7-day deadline.',
      'Park issues that do not fit this week. Solved issues move to Recently solved, then to the archive.',
    ],
  },
  {
    title: 'Good to-dos',
    body: [
      'A to-do is one action, with one owner and a date within the next 7 days.',
      'If it takes longer than a week, it is a quarterly priority with milestones, not a to-do.',
      'Aim for about 90% of to-dos done each week. Consistently lower means the list is too ambitious or accountability is weak.',
    ],
  },
  {
    title: 'KPIs and quarterly priorities',
    body: [
      'Keep KPIs to the handful of numbers that tell you whether the week went well. Each has one owner and a target.',
      'A quarterly priority is a project that matters most in the next 90 days. Have no more than a few per person.',
      'Break each priority into milestones so progress is visible. Mark it off track as soon as you know, not at the end of the quarter.',
    ],
  },
  {
    title: 'Org chart, 1:1s and Right Person Right Seat',
    body: [
      'The org chart shows seats, not people. Define what each seat is accountable for, then place a person in it.',
      'Direct reports are the people sitting directly beneath your seat. Use them to create quarterly alignment meetings.',
      'Quarterly 1:1s are private to the manager and the team member. Both answer the same questions, then compare.',
      'Right Person Right Seat checks two things: does the person fit your core values (mostly +), and do they Get it, Want it and have the Capacity for the seat.',
    ],
  },
  {
    title: 'Growth Plan',
    body: [
      'Future Focus holds the long view: core values, what/how/why, a 5-year vision, your marketing strategy and a 3-year picture.',
      'Short-Term Focus holds the 1-year plan, the 90-day plan, the current quarterly priorities and the parking lot of issues you will get to later.',
      'Use Presentation mode in meetings and Edit mode to change it. Only managers can edit.',
    ],
  },
]

export default function ResourceCenterPage() {
  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><LifeBuoy className="w-7 h-7 text-blue-600" /> Resource center</h1>
      <p className="text-sm text-gray-500 mb-6">Short guides on running effective meetings with this module.</p>
      <div className="space-y-3">
        {TOPICS.map((t, i) => (
          <details key={t.title} open={i === 0} className="border rounded-xl bg-white shadow-sm group">
            <summary className="cursor-pointer select-none px-5 py-4 font-semibold text-slate-900 flex items-center justify-between">
              {t.title}
              <span className="text-gray-400 text-sm group-open:rotate-90 transition-transform">&rsaquo;</span>
            </summary>
            <ul className="px-5 pb-4 space-y-2 list-disc list-inside text-sm text-slate-700">
              {t.body.map((line, j) => <li key={j}>{line}</li>)}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
