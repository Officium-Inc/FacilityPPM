'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search,
  Users,
  MailPlus,
  ShieldCheck,
  PlugZap,
  KeyRound,
  SearchX,
  UserCircle,
  Building2,
} from 'lucide-react'

interface Props {
  slug: string
  memberCount: number
  pendingInviteCount: number
  canManageSettings: boolean
}

interface HubItem {
  key: string
  label: string
  description: string
  href: string
  icon: React.ElementType
  iconClass: string
  meta?: string
}

interface HubSection {
  title: string
  items: HubItem[]
}

export default function SettingsHubClient({
  slug,
  memberCount,
  pendingInviteCount,
  canManageSettings,
}: Props) {
  const [query, setQuery] = useState('')

  const sections = useMemo<HubSection[]>(
    () => [
      {
        title: 'Account',
        items: [
          {
            key: 'profile',
            label: 'Your Profile',
            description: 'Update your name, contact details and password',
            href: `/${slug}/settings?tab=profile`,
            icon: UserCircle,
            iconClass: 'bg-sky-50 text-sky-600',
          },
          {
            key: 'company',
            label: 'Company Profile',
            description: 'Manage company name, address and contact information',
            href: `/${slug}/settings?tab=company`,
            icon: Building2,
            iconClass: 'bg-teal-50 text-teal-600',
            meta: canManageSettings ? undefined : 'View only',
          },
        ],
      },
      {
        title: 'Team & Access',
        items: [
          {
            key: 'members',
            label: 'Members',
            description: 'Invite teammates and manage who has access to this property',
            href: `/${slug}/settings?tab=members`,
            icon: Users,
            iconClass: 'bg-blue-50 text-blue-600',
            meta: `${memberCount} member${memberCount === 1 ? '' : 's'}`,
          },
          {
            key: 'invitations',
            label: 'Pending Invitations',
            description: 'Review invitations that have been sent but not yet accepted',
            href: `/${slug}/settings?tab=members`,
            icon: MailPlus,
            iconClass: 'bg-amber-50 text-amber-600',
            meta: `${pendingInviteCount} pending`,
          },
          {
            key: 'roles',
            label: 'Roles & Permissions',
            description: 'Control what admins, managers, engineers and viewers can do',
            href: `/${slug}/settings?tab=members`,
            icon: ShieldCheck,
            iconClass: 'bg-violet-50 text-violet-600',
          },
        ],
      },
      {
        title: 'Integrations',
        items: [
          {
            key: 'monday',
            label: 'Monday.com',
            description: 'Connect a board and sync billed or waived work orders',
            href: `/${slug}/settings?tab=api-keys`,
            icon: PlugZap,
            iconClass: 'bg-green-50 text-green-600',
          },
          {
            key: 'api-keys',
            label: 'API Keys',
            description: 'Manage credentials used to connect external services',
            href: `/${slug}/settings?tab=api-keys`,
            icon: KeyRound,
            iconClass: 'bg-rose-50 text-rose-600',
            meta: canManageSettings ? undefined : 'View only',
          },
        ],
      },
    ],
    [slug, memberCount, pendingInviteCount, canManageSettings]
  )

  const q = query.trim().toLowerCase()
  const filtered = q
    ? sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              item.label.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q)
          ),
        }))
        .filter((section) => section.items.length > 0)
    : sections

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white py-14 text-center shadow-sm">
          <SearchX className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">No settings found</p>
          <p className="text-xs text-gray-500">Try a different search term</p>
        </div>
      ) : (
        filtered.map((section) => (
          <div
            key={section.title}
            className="rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
            </div>
            <div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-gray-50"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-100 ${item.iconClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 group-hover:text-green-700">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 line-clamp-2">
                        {item.description}
                      </span>
                      {item.meta && (
                        <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {item.meta}
                        </span>
                      )}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
