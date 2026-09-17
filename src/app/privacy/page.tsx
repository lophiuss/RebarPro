export const metadata = { title: 'Privacy Policy — AlphaVision' }

// Public route (allowlisted in src/proxy.ts) — exists primarily so this
// app's Google Cloud OAuth consent screen has a privacy policy link to
// point to, which Google requires before a "restricted" scope app (full
// Drive access, used to store Security/Maintenance photos) can be moved
// out of Testing publishing status.
export default function PrivacyPolicyPage() {
  return (
    <div className="flex-1 p-6 md:p-10 max-w-2xl mx-auto text-sm text-gray-700 leading-relaxed">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Privacy Policy</h1>
      <p className="text-xs text-gray-400 mb-8">Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <p className="mb-4">
        AlphaVision is an internal operations tool used by staff and guards of this company to
        manage rebar/cement inventory, security entries, GPS patrol clocking, and maintenance
        work requests. It is not a public consumer product — access is restricted to authorized
        personnel and, for a small number of public-facing forms (visitor check-in, maintenance
        request submission), members of the public who choose to submit a form at our premises.
      </p>

      <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">What we collect</h2>
      <p className="mb-4">
        Depending on which part of the system is used, this may include: name, company, contact
        details, vehicle/badge numbers, photos taken for visitor check-in or maintenance/incident
        evidence, GPS coordinates recorded at the moment of a security patrol clock-in, and
        account information (email) for staff who log in.
      </p>

      <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">How it's used</h2>
      <p className="mb-4">
        Solely for operating this company's internal security, inventory, and maintenance
        processes — e.g. verifying visitor identity at the gate, tracking guard patrol coverage,
        or documenting a maintenance job's evidence photos. Data is not sold, and is not shared
        with third parties outside the ordinary operation of this system and its service
        providers (database hosting, file storage).
      </p>

      <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">Storage</h2>
      <p className="mb-4">
        Records are stored in a managed database (Supabase). Photos are stored in a company
        Google Drive account, accessed by this application via a Google API integration solely
        to upload and retrieve those photos — it does not access any other files in that Drive
        account.
      </p>

      <h2 className="text-lg font-bold text-slate-800 mt-6 mb-2">Contact</h2>
      <p>
        Questions about this policy or your data can be directed to{' '}
        <a href="mailto:davidthen4285@gmail.com" className="text-blue-600 underline">davidthen4285@gmail.com</a>.
      </p>
    </div>
  )
}
