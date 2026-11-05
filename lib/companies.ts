const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface CompanyInput {
  name?: string
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
}

/** Validates tenant company fields; returns the column values to write or an error message. */
export function companyFields(body: CompanyInput, { requireName }: { requireName: boolean }) {
  const fields: Record<string, string | null> = {}
  if (body.name !== undefined || requireName) {
    const name = body.name?.trim() ?? ''
    if (!name || name.length > 120) return { error: 'Company name is required (up to 120 characters).' } as const
    fields.name = name
  }
  if (body.contactName !== undefined) fields.contact_name = body.contactName?.trim() || null
  if (body.contactPhone !== undefined) fields.contact_phone = body.contactPhone?.trim() || null
  if (body.contactEmail !== undefined) {
    const email = body.contactEmail?.trim().toLowerCase() || null
    if (email && !EMAIL_PATTERN.test(email)) return { error: 'Enter a valid contact email.' } as const
    fields.contact_email = email
  }
  return { fields } as const
}
