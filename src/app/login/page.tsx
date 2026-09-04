import { login, signup } from './actions'
import { Button } from '@/components/ui/button'
import { Factory, Boxes, ShieldCheck } from 'lucide-react'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const message = resolvedSearchParams?.message;

  return (
    <div className="min-h-screen w-full flex bg-slate-950">
      {/* Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-16 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Factory className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">AlphaVision</span>
        </div>

        <div className="relative">
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            One platform for<br />every yard and plant.
          </h1>
          <p className="text-slate-400 text-lg max-w-md">
            Track rebar stock and cement batching operations side by side — real-time balances, weighbridge workflows, and reporting in one place.
          </p>

          <div className="mt-10 space-y-4">
            <div className="flex items-center gap-3 text-slate-300">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <Boxes className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-sm">Live stock &amp; silo balances across departments</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-sm">One login, department-scoped access for every user</span>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-600">© {new Date().getFullYear()} AlphaVision</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Factory className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">AlphaVision</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 mb-8">Sign in to continue to your dashboard.</p>

          <form className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                type="password"
                name="password"
                placeholder="••••••••"
                required
              />
            </div>

            <Button formAction={login} className="w-full h-10 mt-2" type="submit">
              Sign In
            </Button>
            <Button formAction={signup} variant="outline" className="w-full h-10" type="submit">
              Sign Up
            </Button>

            {message && (
              <p className="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
                {message}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
