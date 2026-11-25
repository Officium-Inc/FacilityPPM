import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/authz/guard'
import { syncUserAccess } from '@/lib/auth-users'
import { resolveHome } from '@/lib/access'

/**
 * Login check. Rebuilds the user's access lists (app_metadata) from the database rows, then answers where
 * they start: Platform Admin dashboard, their organization or a property, or why they cannot sign in.
 * The client refreshes its session afterwards so the JWT carries the rebuilt lists.
 */
export async function POST() {
  // audit-allow: only reads and syncs the caller's own access rows
  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const sync = await syncUserAccess(service, user.id)
  if (sync.error) console.error('[login] could not sync access lists:', sync.error)

  const home = await resolveHome(service, user)
  if (!home.ok) {
    return NextResponse.json(
      { error: home.reason === 'deactivated' ? 'Account deactivated' : 'No access', reason: home.reason },
      { status: 403 }
    )
  }
  return NextResponse.json({ active: true, destination: home.path })
}
