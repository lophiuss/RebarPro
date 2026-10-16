import FeedbackHost from './ui/FeedbackHost'

// Every Meetings page gets the same confirm dialog, text prompt and toast messages, instead of the
// browser's own alert / confirm / prompt boxes.
export default function MeetingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FeedbackHost />
    </>
  )
}
