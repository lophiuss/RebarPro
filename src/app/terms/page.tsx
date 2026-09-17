export const metadata = { title: 'Terms of Service — AlphaVision' }

// Public route (allowlisted in src/proxy.ts) — see src/app/privacy/page.tsx
// for why this exists (Google OAuth consent screen requirement).
export default function TermsPage() {
  return (
    <div className="flex-1 p-6 md:p-10 max-w-2xl mx-auto text-sm text-gray-700 leading-relaxed">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Terms of Service</h1>
      <p className="text-xs text-gray-400 mb-8">Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <p className="mb-4">
        AlphaVision is an internal operations tool provided for use by this company's staff,
        guards, and — for a small number of public-facing forms (visitor check-in, maintenance
        request submission) — visitors and contractors at our premises. It is not offered as a
        public product or service to the general public.
      </p>

      <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">Acceptable use</h2>
      <p className="mb-4">
        This system is provided for legitimate business operations only — inventory tracking,
        security logging, maintenance requests, and related recordkeeping. Submitting false
        information through any form in this system is not permitted.
      </p>

      <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">No warranty</h2>
      <p className="mb-4">
        This is an internal tool provided as-is, without warranty of any kind. It may be
        unavailable at times for maintenance or due to factors outside our control.
      </p>

      <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">Contact</h2>
      <p>
        Questions about these terms can be directed to{' '}
        <a href="mailto:davidthen4285@gmail.com" className="text-blue-600 underline">davidthen4285@gmail.com</a>.
      </p>
    </div>
  )
}
