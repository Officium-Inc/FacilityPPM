'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'forgot'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const passwordReset = searchParams.get('reset') === '1'
  const deactivated = searchParams.get('reason') === 'deactivated'
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const meta = data.user?.app_metadata ?? {}

    if (meta.role === 'provider') {
      router.push('/provider/properties')
      router.refresh()
      return
    }

    const userSlugs: string[] = (meta.property_slugs as string[] | undefined) ??
      (meta.property_slug ? [meta.property_slug as string] : [])

    if (userSlugs.length === 0) {
      await supabase.auth.signOut()
      setError('Your account is not assigned to any property. Contact your administrator.')
      setLoading(false)
      return
    }

    const destination = (meta.property_slug as string | undefined) ?? userSlugs[0]

    // Check if the user is active in the destination property
    const activeCheck = await fetch('/api/engineers/active-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertySlug: destination }),
    })
    if (!activeCheck.ok) {
      await supabase.auth.signOut()
      setError('Your account has been deactivated. Contact your administrator.')
      setLoading(false)
      return
    }

    router.push(`/${destination}`)
    router.refresh()
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email)

    if (error) {
      setError(error.message)
    } else {
      setInfo('Check your email for a verification code, then visit the reset password page.')
    }
    setLoading(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-700 rounded-xl mb-4">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">FacilityPPM</h1>
          <p className="text-gray-500 text-sm mt-1">Marajo Property Management</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {passwordReset && mode === 'login' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 mb-5">
              Password updated successfully. You can now sign in.
            </div>
          )}
          {deactivated && mode === 'login' && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-5">
              Your account has been deactivated. Contact your administrator.
            </div>
          )}
          {mode === 'login' ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign in to your account</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Reset your password</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {info && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                    {info}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
                >
                  ← Back to sign in
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          FacilityPPM · For authorised users only
        </p>
      </div>
    </div>
  )
}
