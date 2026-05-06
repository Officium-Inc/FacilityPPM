'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LicenseBadge from '@/components/provider/LicenseBadge'
import type { Property, Engineer, LicenseStatus } from '@/types'
import { UserPlus, Shield } from 'lucide-react'

interface Props {
  property: Property
  superadmins: Engineer[]
}

export default function PropertyManageClient({ property, superadmins }: Props) {
  const router = useRouter()
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(property.license_status)
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseMsg, setLicenseMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMsg, setAdminMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleLicenseUpdate(e: React.FormEvent) {
    e.preventDefault()
    setLicenseLoading(true)
    setLicenseMsg(null)

    const res = await fetch(`/api/provider/properties/${property.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_status: licenseStatus }),
    })
    const data = await res.json()

    if (!res.ok) {
      setLicenseMsg({ type: 'error', text: data.error ?? 'Update failed.' })
    } else {
      setLicenseMsg({ type: 'success', text: 'License updated successfully.' })
      router.refresh()
    }
    setLicenseLoading(false)
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    setAdminLoading(true)
    setAdminMsg(null)

    const res = await fetch(`/api/provider/properties/${property.slug}/superadmin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: adminName,
        email: adminEmail,
        password: adminPassword,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setAdminMsg({ type: 'error', text: data.error ?? 'Failed to create admin.' })
    } else {
      setAdminMsg({ type: 'success', text: `Admin account created for ${adminEmail}.` })
      setAdminName('')
      setAdminEmail('')
      setAdminPassword('')
      router.refresh()
    }
    setAdminLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* License Management */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 text-sm">License Management</h3>
        </div>

        <form onSubmit={handleLicenseUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Status
            </label>
            <div className="flex items-center gap-4">
              {(['active', 'trial', 'suspended'] as LicenseStatus[]).map((status) => (
                <label key={status} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="license"
                    value={status}
                    checked={licenseStatus === status}
                    onChange={() => setLicenseStatus(status)}
                    className="text-blue-600"
                  />
                  <LicenseBadge status={status} />
                </label>
              ))}
            </div>
          </div>

          {licenseMsg && (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              licenseMsg.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {licenseMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={licenseLoading || licenseStatus === property.license_status}
            className="bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {licenseLoading ? 'Saving…' : 'Update License'}
          </button>
        </form>
      </div>

      {/* Superadmin Management */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 text-sm">Property Superadmin</h3>
        </div>

        {superadmins.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Existing Admins</p>
            <div className="space-y-2">
              {superadmins.map((admin) => (
                <div key={admin.id} className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-700 font-medium text-xs uppercase">
                      {admin.full_name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{admin.full_name}</p>
                    <p className="text-gray-500 text-xs">{admin.email}</p>
                  </div>
                </div>
              ))}
            </div>
            <hr className="my-4 border-gray-100" />
          </div>
        )}

        <p className="text-sm text-gray-600 mb-4">
          Add a superadmin who will manage this property&apos;s team and work orders.
        </p>

        <form onSubmit={handleAddAdmin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Juan dela Cruz"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temporary Password
            </label>
            <input
              type="text"
              required
              minLength={8}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Share this with the admin. They should change it after first login.
            </p>
          </div>

          {adminMsg && (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              adminMsg.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {adminMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={adminLoading}
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            {adminLoading ? 'Creating…' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
