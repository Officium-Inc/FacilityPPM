import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { ACKNOWLEDGMENT_ROWS, MIN_COST_ROWS, type WorkOrderFormData } from '@/lib/work-order-form'

Font.registerHyphenationCallback((word) => [word])

const NAVY = '#1a3a57'
const TEAL = '#2b6f91'
const GRID = '#9fb3c3'
const SHADE = '#eef4f8'
const HEAD = '#e6eef4'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, color: '#111827', paddingTop: 28, paddingHorizontal: 36, paddingBottom: 26 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  corporation: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY },
  headerLine: { fontSize: 7.5, color: '#374151', marginTop: 2 },
  titleBox: { backgroundColor: NAVY, paddingVertical: 8, paddingHorizontal: 12, width: 150, alignItems: 'center' },
  titleText: { color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'center', lineHeight: 1.2 },
  subtitle: { textAlign: 'center', fontSize: 8, color: '#374151', marginTop: 4, marginBottom: 6 },
  infoBar: { flexDirection: 'row', borderWidth: 0.75, borderColor: GRID },
  infoCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 6, flexDirection: 'row' },
  infoLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#111827' },
  infoValue: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#111827', marginLeft: 4 },
  heading: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: TEAL, marginTop: 9, marginBottom: 3 },
  caption: { fontSize: 7.5, color: '#374151', marginBottom: 3 },
  grid: { borderWidth: 0.75, borderColor: GRID },
  gridRow: { flexDirection: 'row' },
  gridCell: { flex: 1, minHeight: 32, paddingVertical: 4, paddingHorizontal: 6 },
  cellLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#111827' },
  cellValue: { fontSize: 8.5, marginTop: 3 },
  cellValueBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  blank: { borderBottomWidth: 0.75, borderBottomColor: '#111827', height: 11, width: '85%' },
  descBox: { borderWidth: 0.75, borderColor: GRID, minHeight: 70, position: 'relative' },
  descLine: { position: 'absolute', left: 0, right: 0, height: 0, borderBottomWidth: 0.5, borderBottomColor: GRID },
  descText: { fontSize: 9, lineHeight: 1.9, paddingHorizontal: 6, paddingTop: 1 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', padding: 6, paddingTop: 4, backgroundColor: '#ffffff' },
  photo: { width: 112, height: 84, objectFit: 'cover', marginRight: 6, marginBottom: 6, borderWidth: 0.5, borderColor: GRID },
  tableHead: { flexDirection: 'row', backgroundColor: NAVY },
  th: { color: '#ffffff', fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingVertical: 5, paddingHorizontal: 3 },
  tr: { flexDirection: 'row', minHeight: 17, borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: GRID },
  td: { fontSize: 8, paddingVertical: 3.5, paddingHorizontal: 4 },
  totalRow: { flexDirection: 'row', borderWidth: 0.5, borderColor: GRID, borderTopWidth: 0 },
  totalLabel: { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8, paddingVertical: 6, paddingHorizontal: 6 },
  totalValue: { width: 135, fontFamily: 'Helvetica-Bold', fontSize: 8.5, paddingVertical: 6, paddingHorizontal: 6, borderLeftWidth: 0.5, borderLeftColor: GRID },
  note: { fontSize: 7, color: '#6b7280', marginTop: 3 },
  terms: { fontSize: 7.5, lineHeight: 1.35, color: '#1f2937' },
  approvals: { flexDirection: 'row', borderWidth: 0.75, borderColor: GRID },
  approvalCol: { flex: 1 },
  approvalHead: { backgroundColor: HEAD, paddingVertical: 6, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  approvalBody: { padding: 6, minHeight: 54 },
  approvalLine: { fontSize: 8, lineHeight: 1.45 },
  signatureImage: { width: 110, height: 32, objectFit: 'contain' },
  ackHead: { flexDirection: 'row', backgroundColor: HEAD, borderWidth: 0.5, borderColor: GRID },
  ackRow: { flexDirection: 'row', minHeight: 24, borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: GRID },
  ackCell: { paddingVertical: 5, paddingHorizontal: 5, fontSize: 8 },
})

const TZ = 'Asia/Manila'

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  return `${fmtDate(iso)}, ${time}`
}

function fmtMoney(value: number) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const COLS = { no: 28, qty: 52, by: 122, unit: 62, total: 72 }

export default function WorkOrderFormPdf({ data, photoBuffers = [] }: { data: WorkOrderFormData; photoBuffers?: Buffer[] }) {
  const rows = [...data.costRows]
  while (rows.length < MIN_COST_ROWS) rows.push({ description: '', qtyUnit: '', providedBy: '', unitCost: null, totalCost: null, excluded: false })

  return (
    <Document title={`Work Order Request - ${data.woNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.corporation}>{data.corporation.toUpperCase()}</Text>
            {data.addressLine ? <Text style={styles.headerLine}>{data.addressLine}</Text> : null}
            {data.contactLine ? <Text style={styles.headerLine}>{data.contactLine}</Text> : null}
          </View>
          <View style={styles.titleBox}>
            <Text style={styles.titleText}>WORK ORDER</Text>
            <Text style={styles.titleText}>REQUEST</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>{data.subtitle}</Text>

        <View style={styles.infoBar}>
          <View style={[styles.infoCell, { borderRightWidth: 0.75, borderRightColor: GRID }]}>
            <Text style={styles.infoLabel}>DATE:</Text>
            <Text style={styles.infoValue}>{fmtDate(data.date) ?? ''}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>WORK ORDER NO.:</Text>
            <Text style={styles.infoValue}>{data.woNumber}</Text>
          </View>
        </View>

        <Text style={styles.heading}>REQUEST DETAILS</Text>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Cell label="Tenant / Lessee" value={data.tenantLessee} />
            <Cell label="Contact Person" value={data.contactPerson} />
            <Cell label="Telephone / Email" value={data.contactDetail} last />
          </View>
          <View style={[styles.gridRow, { borderTopWidth: 0.5, borderTopColor: GRID }]}>
            <Cell label="Unit / Location" value={data.location} />
            <Cell label="Start Date / Time" value={fmtDateTime(data.startAt)} />
            <Cell label="Completion Date / Time" value={fmtDateTime(data.completedAt)} last />
          </View>
          <View style={[styles.gridRow, { borderTopWidth: 0.5, borderTopColor: GRID }]}>
            <Cell label="Service Provider" value={data.serviceProvider} bold />
            <Cell label="Contact Person" value={data.serviceContact} bold />
            <Cell label="Lead Time" value={data.leadTime} last />
          </View>
        </View>

        <Text style={styles.heading}>DESCRIPTION OF WORK REQUESTED</Text>
        <Text style={styles.caption}>Describe the issue and exact location. Attach photographs if they help explain the request.</Text>
        <View style={styles.descBox}>
          {[1, 2, 3].map((n) => <View key={n} style={[styles.descLine, { top: n * 17 }]} />)}
          <Text style={styles.descText}>{data.description ?? ' '}</Text>
          {photoBuffers.length > 0 ? (
            <View style={styles.photoRow}>
              {photoBuffers.map((buffer, index) => (
                <Image key={index} style={styles.photo} src={{ data: buffer, format: 'jpg' }} />
              ))}
            </View>
          ) : null}
        </View>

        <View wrap={false}>
          <Text style={styles.heading}>MATERIALS, TOOLS AND LABOR</Text>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { width: COLS.no }]}>No.</Text>
            <Text style={[styles.th, { flex: 1 }]}>Description</Text>
            <Text style={[styles.th, { width: COLS.qty }]}>Qty / Unit</Text>
            <Text style={[styles.th, { width: COLS.by }]}>Provided by*</Text>
            <Text style={[styles.th, { width: COLS.unit }]}>Unit Cost</Text>
            <Text style={[styles.th, { width: COLS.total }]}>Total Cost</Text>
          </View>
          {rows.map((row, index) => (
            <View key={index} style={[styles.tr, index % 2 === 1 ? { backgroundColor: SHADE } : {}]}>
              <Text style={[styles.td, { width: COLS.no, textAlign: 'center' }]}>{index + 1}</Text>
              <Text style={[styles.td, { flex: 1 }]}>{row.description}</Text>
              <Text style={[styles.td, { width: COLS.qty }]}>{row.qtyUnit}</Text>
              <Text style={[styles.td, { width: COLS.by }]}>{row.providedBy}</Text>
              <Text style={[styles.td, { width: COLS.unit, textAlign: 'right' }]}>{row.unitCost !== null ? fmtMoney(row.unitCost) : ''}</Text>
              <Text style={[styles.td, { width: COLS.total, textAlign: 'right', color: row.excluded ? '#9ca3af' : '#111827' }]}>
                {row.totalCost !== null ? fmtMoney(row.totalCost) : ''}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ESTIMATED TOTAL   |   *Engineering &amp; Maintenance or Tenant / Lessee</Text>
            <Text style={styles.totalValue}>{data.estimatedTotal !== null ? `PHP ${fmtMoney(data.estimatedTotal)}` : 'PHP __________'}</Text>
          </View>
          {data.hasExcludedRows ? (
            <Text style={styles.note}>Items provided by Tenant / Lessee are listed for reference and are not included in the estimated total.</Text>
          ) : null}
        </View>

        <View wrap={false}>
          <Text style={styles.heading}>TERMS AND CONDITIONS</Text>
          <Text style={styles.terms}>{data.terms}</Text>
        </View>

        <View wrap={false}>
          <Text style={styles.heading}>APPROVALS</Text>
          <View style={styles.approvals}>
            <View style={[styles.approvalCol, { borderRightWidth: 0.5, borderRightColor: GRID }]}>
              <Text style={styles.approvalHead}>PREPARED BY</Text>
              <PersonBlock person={data.preparedBy} />
            </View>
            <View style={[styles.approvalCol, { borderRightWidth: 0.5, borderRightColor: GRID }]}>
              <Text style={styles.approvalHead}>NOTED BY</Text>
              <PersonBlock person={data.notedBy} />
            </View>
            <View style={styles.approvalCol}>
              <Text style={styles.approvalHead}>TENANT / LESSEE APPROVAL</Text>
              <View style={styles.approvalBody}>
                <Text style={styles.approvalLine}>Name: {data.tenantApproval.name ?? '__________________________'}</Text>
                <Text style={styles.approvalLine}>Position: ________________________</Text>
                {data.tenantApproval.signature ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.approvalLine}>Signature: </Text>
                    <Image style={styles.signatureImage} src={data.tenantApproval.signature} />
                  </View>
                ) : (
                  <Text style={styles.approvalLine}>Signature: _____________________</Text>
                )}
                <Text style={styles.approvalLine}>Date: {fmtDate(data.tenantApproval.date) ?? '__________________________'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View wrap={false}>
          <Text style={styles.heading}>SERVICE ACKNOWLEDGMENT - COMPLETE AFTER WORK IS FINISHED</Text>
          <Text style={styles.caption}>I acknowledge that the work above has been completed in accordance with our requirements.</Text>
          <View style={styles.ackHead}>
            <Text style={[styles.th, { width: '24%', color: '#111827' }]}>TECHNICIAN NAME</Text>
            <Text style={[styles.th, { width: '16%', color: '#111827' }]}>DATE</Text>
            <Text style={[styles.th, { width: '25%', color: '#111827' }]}>ACKNOWLEDGED BY</Text>
            <Text style={[styles.th, { width: '35%', color: '#111827' }]}>REQUESTOR SIGNATURE / DATE</Text>
          </View>
          {data.acknowledgments.slice(0, ACKNOWLEDGMENT_ROWS).map((row, index) => (
            <View key={index} style={styles.ackRow}>
              <Text style={[styles.ackCell, { width: '24%' }]}>{`${index + 1}. ${row.technician ?? ''}`}</Text>
              <Text style={[styles.ackCell, { width: '16%' }]}>{fmtDate(row.date) ?? ''}</Text>
              <Text style={[styles.ackCell, { width: '25%' }]}>{row.acknowledgedBy ?? ''}</Text>
              <View style={[styles.ackCell, { width: '35%', flexDirection: 'row', alignItems: 'center' }]}>
                {row.signature ? <Image style={styles.signatureImage} src={row.signature} /> : null}
                {row.signedAt ? <Text style={{ fontSize: 7.5, marginLeft: 4 }}>{fmtDate(row.signedAt)}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

function Cell({ label, value, bold, last }: { label: string; value: string | null; bold?: boolean; last?: boolean }) {
  return (
    <View style={[styles.gridCell, last ? {} : { borderRightWidth: 0.5, borderRightColor: GRID }]}>
      <Text style={styles.cellLabel}>{label}</Text>
      {value ? <Text style={bold ? styles.cellValueBold : styles.cellValue}>{value}</Text> : <View style={[styles.blank, { marginTop: 8 }]} />}
    </View>
  )
}

function PersonBlock({ person }: { person: { name: string | null; position: string | null } }) {
  return (
    <View style={styles.approvalBody}>
      <Text style={styles.approvalLine}>{person.name ?? ' '}</Text>
      <Text style={styles.approvalLine}>{person.position ?? ' '}</Text>
      <Text style={styles.approvalLine}>Signature: _____________________</Text>
      <Text style={styles.approvalLine}>Date: __________________________</Text>
    </View>
  )
}
