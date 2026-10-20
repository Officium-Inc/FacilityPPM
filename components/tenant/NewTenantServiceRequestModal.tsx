'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ImagePlus, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_PHOTOS = 6
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

export default function NewTenantServiceRequestModal({
  slug,
  defaultName,
  defaultContact,
  triggerLabel = 'New Service Report',
  variant = 'primary',
}: {
  slug: string
  defaultName?: string
  defaultContact?: string
  triggerLabel?: string
  variant?: 'primary' | 'link'
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [form, setForm] = useState(emptyForm(defaultName, defaultContact))

  function emptyForm(name?: string, contact?: string) {
    return {
      tenantLessee: '',
      reportedByName: name ?? '',
      reportedByContact: contact ?? '',
      locationNotes: '',
      faultDescription: '',
    }
  }

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((value) => ({ ...value, [key]: e.target.value }))
    }
  }

  function openModal() {
    setError(null)
    setPhotoUrls([])
    setForm(emptyForm(defaultName, defaultContact))
    setOpen(true)
  }

  function close() {
    if (!loading && !uploading) setOpen(false)
  }

  async function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return

    const room = MAX_PHOTOS - photoUrls.length
    if (room <= 0) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`)
      return
    }

    setError(null)
    setUploading(true)
    const uploaded: string[] = []
    const problems: string[] = []

    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith('image/')) {
        problems.push(`${file.name} is not an image.`)
        continue
      }
      if (file.size > MAX_PHOTO_BYTES) {
        problems.push(`${file.name} is larger than 10 MB.`)
        continue
      }

      const body = new FormData()
      body.append('file', file)
      body.append('slug', slug)
      try {
        const res = await fetch('/api/service-requests/upload', { method: 'POST', body })
        const data = await res.json()
        if (res.ok && data.url) uploaded.push(data.url)
        else problems.push(data.error ?? `Could not upload ${file.name}.`)
      } catch {
        problems.push(`Could not upload ${file.name}.`)
      }
    }

    if (files.length > room) problems.push(`Only ${MAX_PHOTOS} photos can be attached.`)
    setPhotoUrls((current) => [...current, ...uploaded])
    if (problems.length) setError(problems.join(' '))
    setUploading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.faultDescription.trim()) {
      setError('Please describe the work requested.')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/service-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, photoUrls, slug }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to submit service report.')
      setLoading(false)
      return
    }

    setOpen(false)
    setLoading(false)
    router.push(`/${slug}/tenant/service-requests/${data.workOrderId}`)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cn(
          'inline-flex items-center gap-2 text-sm font-medium transition-colors',
          variant === 'primary'
            ? 'rounded-lg bg-green-700 px-4 py-2 text-white hover:bg-green-800'
            : 'text-green-700 hover:underline'
        )}
      >
        <Plus className="h-4 w-4" />
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">New Service Report</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Maintenance and engineering service report for the property team.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close service report form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Report Details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Tenant / Lessee">
                    <input
                      type="text"
                      value={form.tenantLessee}
                      onChange={set('tenantLessee')}
                      placeholder="Company or tenant name"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Contact Person">
                    <input
                      type="text"
                      value={form.reportedByName}
                      onChange={set('reportedByName')}
                      placeholder="Full name"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Telephone / Email">
                    <input
                      type="text"
                      value={form.reportedByContact}
                      onChange={set('reportedByContact')}
                      placeholder="Phone or email"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Unit / Location">
                    <input
                      type="text"
                      value={form.locationNotes}
                      onChange={set('locationNotes')}
                      placeholder="e.g. Tower A, Floor 12, Unit 1205"
                      className={INPUT}
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description of Work Requested</h3>
                <Field label="Description" required hint="Describe the issue and its exact location">
                  <textarea
                    value={form.faultDescription}
                    onChange={set('faultDescription')}
                    placeholder="What needs to be repaired, checked or installed?"
                    rows={4}
                    required
                    className={`${INPUT} resize-none`}
                  />
                </Field>

                <Field label="Photos" hint={`optional, up to ${MAX_PHOTOS}`}>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotos}
                    className="hidden"
                    disabled={uploading || photoUrls.length >= MAX_PHOTOS}
                  />
                  <div className="flex flex-wrap gap-2">
                    {photoUrls.map((url, index) => (
                      <div key={url} className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Attached photo ${index + 1}`}
                          className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPhotoUrls((current) => current.filter((item) => item !== url))}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {photoUrls.length < MAX_PHOTOS && (
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        disabled={uploading}
                        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 transition-colors hover:border-green-500 hover:text-green-700 disabled:opacity-50"
                      >
                        <ImagePlus className="h-5 w-5" />
                        {uploading ? 'Uploading...' : 'Add photo'}
                      </button>
                    )}
                  </div>
                </Field>
              </section>

              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Priority is assessed by the property engineers after they inspect the report.
              </p>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading || uploading}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || uploading}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Submit Service Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-1 font-normal text-gray-400">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
