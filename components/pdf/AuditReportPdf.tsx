import { Document, Font, Link, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { AuditReportData } from '@/lib/audit-report'

// Keep names, emails and step labels intact instead of breaking them with hyphens
Font.registerHyphenationCallback((word) => [word])

const GREEN = '#15803d'
const RED = '#b91c1c'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 56,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', flex: 1, paddingRight: 12 },
  amount: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 },
  metaTable: { flex: 1 },
  metaLine: { flexDirection: 'row', marginBottom: 3 },
  metaLabel: { width: 70, color: '#6b7280' },
  metaValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  stamp: {
    borderWidth: 1.5,
    borderRadius: 2,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  stampText: { fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  rule: { borderBottomWidth: 1, borderBottomColor: '#111827', marginTop: 10 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  tableHead: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', paddingRight: 6 },
  tr: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
  },
  td: { paddingRight: 6 },
  strong: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280' },
  small: { fontSize: 7.5 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  detailCell: { width: '50%', paddingRight: 10, marginBottom: 8 },
  detailWide: { width: '100%', paddingRight: 10, marginBottom: 8 },
  detailLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 1 },
  totals: { alignItems: 'flex-end', marginTop: 8 },
  totalLine: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  totalLabel: { width: 90, textAlign: 'right', paddingRight: 8 },
  totalValue: { width: 80, textAlign: 'right' },
  fileLink: { color: '#047857', textDecoration: 'underline', marginBottom: 3, fontSize: 8 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#d1d5db',
    paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: '#9ca3af' },
})

const COLS = { name: '27%', role: '27%', step: '17%', decision: '13%', when: '16%' }

const TZ = 'Asia/Manila'

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

function fmtMoney(value: number) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const STATUS_STAMP: Record<string, { label: string; color: string }> = {
  completed: { label: 'COMPLETED', color: GREEN },
  cancelled: { label: 'CANCELLED', color: RED },
}

export default function AuditReportPdf({ data }: { data: AuditReportData }) {
  const stamp = STATUS_STAMP[data.status] ?? {
    label: data.status.replace(/_/g, ' ').toUpperCase(),
    color: '#b45309',
  }
  const totalLabel = data.isCostWaived
    ? 'COST WAIVED'
    : data.total !== null
    ? `${fmtMoney(data.total)} PHP`
    : null

  return (
    <Document title={`Service Report Audit - ${data.woNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Service Report {data.woNumber}</Text>
          {totalLabel ? <Text style={styles.amount}>{totalLabel}</Text> : null}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaTable}>
            <MetaLine label="Source" value="Tenant360" />
            <MetaLine label="Organisation" value={data.propertyName} />
            <MetaLine label="Generated on" value={`${fmtDate(data.generatedAt)} ${fmtTime(data.generatedAt)}`} />
            <MetaLine
              label="Requester"
              value={`${data.requesterName}${data.requesterEmail ? ` (${data.requesterEmail})` : ''}`}
            />
          </View>
          <View style={[styles.stamp, { borderColor: stamp.color }]}>
            <Text style={[styles.stampText, { color: stamp.color }]}>{stamp.label}</Text>
          </View>
        </View>

        <View style={styles.rule} />

        <Text style={styles.sectionTitle}>Work Timeline</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.th, { width: COLS.name }]}>Name and email</Text>
          <Text style={[styles.th, { width: COLS.role }]}>Role / reason</Text>
          <Text style={[styles.th, { width: COLS.step }]}>Step</Text>
          <Text style={[styles.th, { width: COLS.decision }]}>Decision</Text>
          <Text style={[styles.th, { width: COLS.when }]}>Date | Time</Text>
        </View>
        {data.timeline.length === 0 ? (
          <Text style={[styles.muted, { paddingVertical: 8 }]}>No timeline entries were recorded.</Text>
        ) : (
          data.timeline.map((entry, index) => (
            <View key={`${entry.key}-${index}`} style={styles.tr} wrap={false}>
              <View style={[styles.td, { width: COLS.name }]}>
                <Text style={styles.strong}>{entry.name}</Text>
                {entry.email ? <Text style={styles.small}>{entry.email}</Text> : null}
              </View>
              <View style={[styles.td, { width: COLS.role }]}>
                {entry.role ? <Text>{entry.role}</Text> : null}
                {entry.reason ? (
                  <Text style={[styles.small, styles.muted]}>{truncate(entry.reason, 220)}</Text>
                ) : null}
              </View>
              <Text style={[styles.td, { width: COLS.step }]}>{entry.step}</Text>
              <Text style={[styles.td, styles.strong, { width: COLS.decision }]}>{entry.decision}</Text>
              <View style={[styles.td, { width: COLS.when }]}>
                <Text>{fmtDate(entry.at)}</Text>
                <Text style={styles.small}>{fmtTime(entry.at)}</Text>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Report Details</Text>
        <View style={styles.detailGrid}>
          <Detail label="Tenant / Lessee" value={data.tenantLessee} />
          <Detail label="Unit / Location" value={data.location} />
          <Detail label="Contact Person" value={data.contactPerson} />
          <Detail label="Telephone / Email" value={data.contactDetail} />
          <Detail label="Priority" value={data.priority} />
          <Detail label="Reported" value={`${fmtDate(data.reportedAt)} ${fmtTime(data.reportedAt)}`} />
          <Detail label="Work carried out by" value={data.executionLabel} />
          <Detail label="Assigned engineer" value={data.engineerName} />
          <Detail label="Due date" value={data.dueDate ? fmtDate(data.dueDate) : null} />
          <Detail label="Completed" value={data.completedAt ? `${fmtDate(data.completedAt)} ${fmtTime(data.completedAt)}` : null} />
          <Detail label="Description of work requested" value={data.description} wide />
          {data.workDone ? <Detail label="Work performed" value={data.workDone} wide /> : null}
        </View>

        {(data.costLines.length > 0 || data.isCostWaived) && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>
              {data.costLines.length > 0 ? `Line Items (${data.costLines.length})` : 'Cost'}
            </Text>
            {data.costLines.length > 0 && (
              <View style={styles.tableHead}>
                <Text style={[styles.th, { width: '24%' }]}>Category</Text>
                <Text style={[styles.th, { width: '56%' }]}>Description</Text>
                <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Amount PHP</Text>
              </View>
            )}
            {data.costLines.map((line, index) => (
              <View key={`${line.category}-${index}`} style={styles.tr}>
                <Text style={[styles.td, { width: '24%' }]}>{line.category}</Text>
                <Text style={[styles.td, { width: '56%' }]}>{line.description}</Text>
                <Text style={[styles.td, { width: '20%', textAlign: 'right' }]}>{fmtMoney(line.amount)}</Text>
              </View>
            ))}
            <View style={styles.totals}>
              {data.isCostWaived ? (
                <Text style={styles.muted}>
                  Cost waived{data.costWaivedBy ? ` by ${data.costWaivedBy}` : ''}
                  {data.costWaivedReason ? `: ${data.costWaivedReason}` : ''}
                </Text>
              ) : null}
              {data.total !== null ? (
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLabel, styles.strong]}>Total (PHP):</Text>
                  <Text style={[styles.totalValue, styles.strong]}>{fmtMoney(data.total)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {data.files.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Files</Text>
            {data.files.map((file, index) => (
              <Link key={`${file.url}-${index}`} src={file.url} style={styles.fileLink}>
                {file.label}
              </Link>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Tenant360 · Audit report · {data.woNumber} · Record {data.recordHash.slice(0, 16)}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaLine}>
      <Text style={styles.metaLabel}>{label}:</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

function Detail({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <View style={wide ? styles.detailWide : styles.detailCell} wrap={false}>
      <Text style={styles.detailLabel}>{label.toUpperCase()}</Text>
      <Text>{value && value.trim() ? value : '-'}</Text>
    </View>
  )
}
