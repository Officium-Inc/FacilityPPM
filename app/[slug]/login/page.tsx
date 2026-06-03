import { redirect } from 'next/navigation'

// All per-property login URLs now redirect to the unified /login page.
// One account, one login — property switching handled via the Topbar switcher.
export default function PropertyLoginPage() {
  redirect('/login')
}
