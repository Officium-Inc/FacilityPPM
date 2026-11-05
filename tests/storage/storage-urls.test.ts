import { beforeAll, describe, expect, it } from 'vitest'
import {
  fileOwnerFromPath,
  fileRouteUrl,
  parseStorageUrl,
  toStorageRef,
  toStoredFileUrl,
  withFileRouteUrls,
} from '@/lib/storage-urls'
import { sanitizeWorkOrderFileUrls } from '@/lib/work-order-files'

const SUPABASE = 'https://proj.supabase.co'
const APP = 'https://app.example.com'
const PROPERTY = '11111111-1111-4111-8111-111111111111'
const WORK_ORDER = '22222222-2222-4222-8222-222222222222'
const MEMBER = '33333333-3333-4333-8333-333333333333'
const stored = (path: string, bucket = 'receipts') => `${SUPABASE}/storage/v1/object/public/${bucket}/${path}`

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE
  process.env.NEXT_PUBLIC_APP_URL = APP
})

describe('parseStorageUrl', () => {
  it('reads stored URLs and file-route URLs of our buckets', () => {
    expect(parseStorageUrl(stored(`${PROPERTY}/${WORK_ORDER}/a.webp`))).toEqual({ bucket: 'receipts', path: `${PROPERTY}/${WORK_ORDER}/a.webp` })
    expect(parseStorageUrl(`/api/files/receipts/${WORK_ORDER}/a.pdf`)).toEqual({ bucket: 'receipts', path: `${WORK_ORDER}/a.pdf` })
    expect(parseStorageUrl(`${APP}/api/files/evidence/x/y.png`)).toEqual({ bucket: 'evidence', path: 'x/y.png' })
    expect(parseStorageUrl(`${stored('a/b.png')}?download=1`)).toEqual({ bucket: 'receipts', path: 'a/b.png' })
  })

  it('rejects other hosts, other buckets and path traversal', () => {
    expect(parseStorageUrl('https://evil.example.com/storage/v1/object/public/receipts/a.png')).toBeNull()
    expect(parseStorageUrl('https://evil.example.com/api/files/receipts/a/b.png')).toBeNull()
    expect(parseStorageUrl(stored('a.png', 'avatars'))).toBeNull()
    expect(parseStorageUrl(stored('a/../../secrets.txt'))).toBeNull()
    expect(parseStorageUrl('/api/files/receipts/a/%2E%2E/b.png')).toBeNull()
    expect(parseStorageUrl('/api/files/receipts//etc/passwd')).toBeNull()
    expect(parseStorageUrl(42)).toBeNull()
    expect(toStorageRef('receipts', 'a\\b.png')).toBeNull()
  })
})

describe('file route URLs', () => {
  it('maps stored URLs to the authenticated route and back', () => {
    const url = stored(`${PROPERTY}/${WORK_ORDER}/a b.webp`)
    expect(fileRouteUrl(url)).toBe(`/api/files/receipts/${PROPERTY}/${WORK_ORDER}/a%20b.webp`)
    expect(fileRouteUrl(url, { absolute: true })).toBe(`${APP}/api/files/receipts/${PROPERTY}/${WORK_ORDER}/a%20b.webp`)
    expect(toStoredFileUrl(fileRouteUrl(url))).toBe(url)
    expect(fileRouteUrl('https://example.com/x.png')).toBe('https://example.com/x.png')
  })

  it('rewrites stored URLs anywhere inside plain data', () => {
    const data = {
      pdf_url: stored(`receipts/WO-1-${WORK_ORDER}.pdf`),
      reports: [{ photo_urls: [stored(`${WORK_ORDER}/a.webp`)], note: 'kept' }],
      count: 2,
      empty: null,
    }
    expect(withFileRouteUrls(data)).toEqual({
      pdf_url: `/api/files/receipts/receipts/WO-1-${WORK_ORDER}.pdf`,
      reports: [{ photo_urls: [`/api/files/receipts/${WORK_ORDER}/a.webp`], note: 'kept' }],
      count: 2,
      empty: null,
    })
  })

  it('lets sanitizers accept file-route URLs sent back by the browser, in stored form', () => {
    const own = stored(`${PROPERTY}/${WORK_ORDER}/a.webp`)
    const other = stored(`${PROPERTY}/44444444-4444-4444-8444-444444444444/b.webp`)
    expect(sanitizeWorkOrderFileUrls([fileRouteUrl(own), fileRouteUrl(other), 'https://evil.example.com/x.png'], PROPERTY, WORK_ORDER))
      .toEqual([own])
  })
})

describe('fileOwnerFromPath', () => {
  it('finds the work order of attachments, receipts and audit reports', () => {
    expect(fileOwnerFromPath(`${PROPERTY}/${WORK_ORDER}/a.webp`)).toEqual({ kind: 'workOrder', workOrderId: WORK_ORDER, propertyId: PROPERTY })
    expect(fileOwnerFromPath(`${WORK_ORDER}/a.webp`)).toEqual({ kind: 'workOrder', workOrderId: WORK_ORDER, propertyId: null })
    expect(fileOwnerFromPath(`receipts/REPT-AB12-${WORK_ORDER}.pdf`)).toEqual({ kind: 'workOrder', workOrderId: WORK_ORDER, propertyId: null })
    expect(fileOwnerFromPath(`audit-reports/WO-9-${WORK_ORDER}.pdf`)).toEqual({ kind: 'workOrder', workOrderId: WORK_ORDER, propertyId: null })
  })

  it('finds the uploader of tenant photos', () => {
    expect(fileOwnerFromPath(`service-reports/${PROPERTY}/${MEMBER}/1-x.webp`)).toEqual({ kind: 'serviceReport', propertyId: PROPERTY, memberId: MEMBER })
    expect(fileOwnerFromPath(`service-reports/${PROPERTY}/1-x.webp`)).toEqual({ kind: 'serviceReport', propertyId: PROPERTY, memberId: null })
  })

  it('returns null for unknown layouts', () => {
    expect(fileOwnerFromPath('avatars/me.png')).toBeNull()
    expect(fileOwnerFromPath('receipts/no-id.pdf')).toBeNull()
    expect(fileOwnerFromPath(`service-reports/not-a-uuid/${MEMBER}/x.webp`)).toBeNull()
    expect(fileOwnerFromPath(`${PROPERTY}/${WORK_ORDER}/deeper/x.webp`)).toBeNull()
  })
})
