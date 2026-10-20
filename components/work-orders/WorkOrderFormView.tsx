import { ChevronDown, FileDown } from 'lucide-react'
import { formatPHT } from '@/lib/utils'
import { ACKNOWLEDGMENT_ROWS, MIN_COST_ROWS, type FormCostRow, type WorkOrderFormData } from '@/lib/work-order-form'

const money = (value: number) =>
  value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Read-only view of the Work Order Request form (the same layout as the Service Report PDF). */
export default function WorkOrderFormView({
  data,
  pdfHref,
  defaultOpen = true,
}: {
  data: WorkOrderFormData
  pdfHref: string
  defaultOpen?: boolean
}) {
  const rows: Array<FormCostRow | null> = [...data.costRows]
  while (rows.length < MIN_COST_ROWS) rows.push(null)

  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-lg border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
          Service Report Form
        </span>
        <span className="text-xs text-gray-400">{data.woNumber}</span>
      </summary>
      <div className="flex justify-end border-t border-gray-100 px-4 py-2">
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-green-400 hover:bg-green-50"
        >
          <FileDown className="h-3.5 w-3.5" /> Download PDF
        </a>
      </div>

      <div className="space-y-4 p-4 text-sm text-gray-900 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-bold uppercase leading-tight text-[#1a3a57]">{data.corporation}</p>
            {data.addressLine && <p className="mt-0.5 text-xs text-gray-600">{data.addressLine}</p>}
            {data.contactLine && <p className="text-xs text-gray-600">{data.contactLine}</p>}
          </div>
          <div className="shrink-0 bg-[#1a3a57] px-4 py-2 text-center text-sm font-bold leading-tight text-white sm:w-36">
            WORK ORDER<br />REQUEST
          </div>
        </div>
        <p className="text-center text-xs text-gray-600">{data.subtitle}</p>

        <div className="grid grid-cols-1 divide-y divide-[#9fb3c3] border border-[#9fb3c3] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <p className="px-3 py-2 font-bold">DATE: <span className="ml-1">{data.date ? formatPHT(data.date) : ''}</span></p>
          <p className="px-3 py-2 font-bold">WORK ORDER NO.: <span className="ml-1">{data.woNumber}</span></p>
        </div>

        <Heading>REQUEST DETAILS</Heading>
        <div className="grid grid-cols-1 border border-[#9fb3c3] sm:grid-cols-3">
          <Cell label="Tenant / Lessee" value={data.tenantLessee} />
          <Cell label="Contact Person" value={data.contactPerson} />
          <Cell label="Telephone / Email" value={data.contactDetail} />
          <Cell label="Unit / Location" value={data.location} />
          <Cell label="Start Date / Time" value={data.startAt ? formatPHT(data.startAt, true) : null} />
          <Cell label="Completion Date / Time" value={data.completedAt ? formatPHT(data.completedAt, true) : null} />
          <Cell label="Service Provider" value={data.serviceProvider} bold />
          <Cell label="Contact Person" value={data.serviceContact} bold />
          <Cell label="Lead Time" value={data.leadTime} />
        </div>

        <Heading>DESCRIPTION OF WORK REQUESTED</Heading>
        <p className="-mt-3 text-xs text-gray-600">Describe the issue and exact location. Attach photographs if they help explain the request.</p>
        <div className="min-h-[4.5rem] border border-[#9fb3c3] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_1.7rem,#9fb3c3_1.7rem,#9fb3c3_1.75rem)]">
          <p className="whitespace-pre-wrap px-3 leading-7">{data.description ?? ''}</p>
          {data.photos.length > 0 && (
            <div className="flex flex-wrap gap-2 bg-white p-2">
              {data.photos.map((url, index) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Report photo ${index + 1}`} className="h-20 w-28 border border-[#9fb3c3] object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>

        <Heading>MATERIALS, TOOLS AND LABOR</Heading>
        <div className="-mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-xs">
            <thead>
              <tr className="bg-[#1a3a57] text-white">
                <th className="w-10 px-2 py-2 font-bold">No.</th>
                <th className="px-2 py-2 font-bold">Description</th>
                <th className="px-2 py-2 font-bold">Qty / Unit</th>
                <th className="px-2 py-2 font-bold">Provided by*</th>
                <th className="px-2 py-2 text-right font-bold">Unit Cost</th>
                <th className="px-2 py-2 text-right font-bold">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className={`h-7 border border-[#9fb3c3] ${index % 2 === 1 ? 'bg-[#eef4f8]' : ''}`}>
                  <td className="px-2 text-center">{index + 1}</td>
                  <td className="px-2">{row?.description}</td>
                  <td className="px-2">{row?.qtyUnit}</td>
                  <td className="px-2">{row?.providedBy}</td>
                  <td className="px-2 text-right">{row?.unitCost != null ? money(row.unitCost) : ''}</td>
                  <td className={`px-2 text-right ${row?.excluded ? 'text-gray-400' : ''}`}>{row?.totalCost != null ? money(row.totalCost) : ''}</td>
                </tr>
              ))}
              <tr className="border border-[#9fb3c3] font-bold">
                <td colSpan={5} className="px-2 py-2 text-right">ESTIMATED TOTAL &nbsp;|&nbsp; *Engineering &amp; Maintenance or Tenant / Lessee</td>
                <td className="whitespace-nowrap border-l border-[#9fb3c3] px-2 py-2 text-right">
                  {data.estimatedTotal !== null ? `PHP ${money(data.estimatedTotal)}` : 'PHP ______'}
                </td>
              </tr>
            </tbody>
          </table>
          {data.hasExcludedRows && (
            <p className="mt-1 text-[11px] text-gray-500">Items provided by Tenant / Lessee are listed for reference and are not included in the estimated total.</p>
          )}
        </div>

        <Heading>TERMS AND CONDITIONS</Heading>
        <p className="-mt-3 text-xs leading-relaxed text-gray-700">{data.terms}</p>

        <Heading>APPROVALS</Heading>
        <div className="-mt-3 grid grid-cols-1 border border-[#9fb3c3] sm:grid-cols-3 sm:divide-x sm:divide-[#9fb3c3]">
          <Approval title="PREPARED BY">
            <p>{data.preparedBy.name ?? '\u00a0'}</p>
            <p>{data.preparedBy.position ?? '\u00a0'}</p>
            <Line label="Signature" />
            <Line label="Date" />
          </Approval>
          <Approval title="NOTED BY">
            <p>{data.notedBy.name ?? '\u00a0'}</p>
            <p>{data.notedBy.position ?? '\u00a0'}</p>
            <Line label="Signature" />
            <Line label="Date" />
          </Approval>
          <Approval title="TENANT / LESSEE APPROVAL">
            <Line label="Name" value={data.tenantApproval.name} />
            <Line label="Position" />
            {data.tenantApproval.signature ? (
              <div className="flex items-center gap-2">
                <span>Signature:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.tenantApproval.signature} alt="Tenant signature" className="h-9 w-28 object-contain" />
              </div>
            ) : (
              <Line label="Signature" />
            )}
            <Line label="Date" value={data.tenantApproval.date ? formatPHT(data.tenantApproval.date) : null} />
          </Approval>
        </div>

        <Heading>SERVICE ACKNOWLEDGMENT - COMPLETE AFTER WORK IS FINISHED</Heading>
        <p className="-mt-3 text-xs text-gray-600">I acknowledge that the work above has been completed in accordance with our requirements.</p>
        <div className="-mt-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-xs">
            <thead>
              <tr className="bg-[#e6eef4]">
                <th className="px-2 py-2 font-bold">TECHNICIAN NAME</th>
                <th className="px-2 py-2 font-bold">DATE</th>
                <th className="px-2 py-2 font-bold">ACKNOWLEDGED BY</th>
                <th className="px-2 py-2 font-bold">REQUESTOR SIGNATURE / DATE</th>
              </tr>
            </thead>
            <tbody>
              {data.acknowledgments.slice(0, ACKNOWLEDGMENT_ROWS).map((row, index) => (
                <tr key={index} className="h-9 border border-[#9fb3c3]">
                  <td className="px-2">{index + 1}. {row.technician ?? ''}</td>
                  <td className="px-2">{row.date ? formatPHT(row.date) : ''}</td>
                  <td className="px-2">{row.acknowledgedBy ?? ''}</td>
                  <td className="px-2">
                    <div className="flex items-center gap-2">
                      {row.signature && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.signature} alt="Requestor signature" className="h-8 w-24 object-contain" />
                      )}
                      {row.signedAt && <span>{formatPHT(row.signedAt)}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h4 className="pt-1 text-sm font-bold text-[#2b6f91]">{children}</h4>
}

function Cell({ label, value, bold }: { label: string; value: string | null; bold?: boolean }) {
  return (
    <div className="min-h-[3.25rem] border-b border-[#9fb3c3] px-3 py-2 sm:border-r sm:[&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:sm:border-b-0">
      <p className="text-[11px] font-bold uppercase">{label}</p>
      {value ? (
        <p className={`mt-1 break-words ${bold ? 'font-bold' : ''}`}>{value}</p>
      ) : (
        <span className="mt-3 block h-px w-4/5 bg-gray-900" />
      )}
    </div>
  )
}

function Approval({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#9fb3c3] last:border-b-0 sm:border-b-0">
      <p className="bg-[#e6eef4] py-2 text-center text-xs font-bold">{title}</p>
      <div className="space-y-1 p-3 text-xs">{children}</div>
    </div>
  )
}

function Line({ label, value }: { label: string; value?: string | null }) {
  return <p>{label}: {value ?? '________________________'}</p>
}
