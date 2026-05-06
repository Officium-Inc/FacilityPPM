import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LicenseBadge from '@/components/provider/LicenseBadge'
import PropertyManageClient from './PropertyManageClient'
import type { Property, Engineer } from '@/types'
import { ArrowLeft } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PropertyManagePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!property) notFound()

  const prop = property as Property

  const { data: engineers } = await supabase
    .from('engineers')
    .select('*, roles(name)')
    .eq('property_id', prop.id)
    .order('full_name')

  const superadmins = (engineers as Engineer[])?.filter(
    (e) => e.roles?.name === 'admin'
  ) ?? []

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/provider/properties"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Properties
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{prop.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <code className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
              /{prop.slug}
            </code>
            <LicenseBadge status={prop.license_status} />
          </div>
        </div>
        <a
          href={`/${prop.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          Open property dashboard →
        </a>
      </div>

      {/* Client-side management panels */}
      <PropertyManageClient property={prop} superadmins={superadmins} />
    </div>
  )
}
