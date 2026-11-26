import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { loadWorkOrderForm } from '@/lib/work-order-form'

const property = {
  name: 'Riverside Tower',
  legal_name: 'Riverside Property Services',
  address: '1 Property Street',
  city: 'Pasig',
  country: 'Philippines',
  contact_phone: '555-0200',
  fax: '555-0201',
  work_order_terms: 'Property-specific terms.',
}

function formService(orders: Record<string, Record<string, unknown>>) {
  return createClient('https://supabase.test', 'test-key', {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input))
        if (url.pathname !== '/rest/v1/work_orders') return Response.json([])

        expect(url.searchParams.get('select')).toContain('organization:organizations!properties_organization_id_fkey(')
        const id = url.searchParams.get('id')?.slice(3) ?? ''
        return Response.json({ status: 'new_report', wo_number: id, ...orders[id] })
      },
    },
  })
}

describe('service report letterhead', () => {
  it('uses the organization linked to each work order’s property', async () => {
    const service = formService({
      first: {
        properties: {
          ...property,
          organization: {
            name: 'Example Holdings',
            legal_name: ' Example 26th Condominium Corporation ',
            address: ' 2 Organization Avenue ',
            city: ' Taguig ',
            country: 'Philippines',
            contact_phone: ' 555-0100 ',
          },
        },
      },
      second: {
        properties: { name: 'North Building', organization: { name: 'North Facilities' } },
        execution_mode: 'third_party',
        contractor_name: 'External Contractor',
      },
    })

    const [first, second] = await Promise.all([
      loadWorkOrderForm(service, 'first'),
      loadWorkOrderForm(service, 'second'),
    ])

    expect(first).toMatchObject({
      corporation: 'Example 26th Condominium Corporation',
      addressLine: '2 Organization Avenue, Taguig, Philippines',
      contactLine: 'Tel. Nos. 555-0100  |  Fax 555-0201',
      serviceProvider: 'Riverside Property Services',
      terms: property.work_order_terms,
    })
    expect(second).toMatchObject({
      corporation: 'North Facilities',
      addressLine: null,
      contactLine: null,
      serviceProvider: 'External Contractor',
    })
  })

  it('uses property contact details when the organization address and phone are blank', async () => {
    const service = formService({
      order: {
        properties: {
          ...property,
          organization: { name: 'Example Holdings', legal_name: ' ', address: null, city: ' ', country: null, contact_phone: ' ' },
        },
      },
    })

    expect(await loadWorkOrderForm(service, 'order')).toMatchObject({
      corporation: 'Example Holdings',
      addressLine: '1 Property Street, Pasig, Philippines',
      contactLine: 'Tel. Nos. 555-0200  |  Fax 555-0201',
    })
  })

  it('renders a partial organization address without mixing in property address fields', async () => {
    const service = formService({
      order: { properties: { ...property, organization: { name: 'Example Holdings', address: '2 Organization Avenue' } } },
    })

    expect(await loadWorkOrderForm(service, 'order')).toMatchObject({ addressLine: '2 Organization Avenue' })
  })

  it('uses the property name when there is no organization or property legal name', async () => {
    const service = formService({
      order: { properties: { ...property, legal_name: null, organization: null } },
    })

    expect(await loadWorkOrderForm(service, 'order')).toMatchObject({
      corporation: 'Riverside Tower',
      addressLine: '1 Property Street, Pasig, Philippines',
      contactLine: 'Tel. Nos. 555-0200  |  Fax 555-0201',
    })
  })
})
