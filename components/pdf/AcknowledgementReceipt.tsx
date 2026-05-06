import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { format } from 'date-fns'
import type { WorkOrder } from '@/types'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 36,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#1d4ed8',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { color: '#ffffff' },
  headerTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  headerSub: { fontSize: 9, color: '#bfdbfe', marginTop: 2 },
  verifiedBadge: {
    backgroundColor: '#16a34a',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  verifiedText: { color: '#ffffff', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  refRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 4,
  },
  refLabel: { fontSize: 7, color: '#6b7280', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  refValue: { fontSize: 9, color: '#111827', marginTop: 2 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1d4ed8',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 3,
    marginBottom: 6,
    marginTop: 10,
  },
  row: { flexDirection: 'row', marginBottom: 3 },
  col: { flex: 1 },
  label: { fontSize: 7, color: '#6b7280', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 1 },
  value: { fontSize: 9, color: '#111827' },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  checklistDesc: { flex: 1, fontSize: 8, color: '#374151' },
  checklistResult: { fontSize: 8, fontFamily: 'Helvetica-Bold', width: 40, textAlign: 'right' },
  signatureBox: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    padding: 6,
    marginTop: 4,
    minHeight: 60,
  },
  signatureImage: { maxHeight: 60, objectFit: 'contain' },
  auditBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    padding: 8,
    marginTop: 10,
  },
  auditTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 4 },
  auditRow: { flexDirection: 'row', marginBottom: 2 },
  auditLabel: { fontSize: 7, color: '#6b7280', width: 120 },
  auditValue: { fontSize: 7, color: '#374151', flex: 1 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: '#9ca3af', textAlign: 'center' },
})

interface Props {
  workOrder: WorkOrder
  recordHash: string
}

function resultLabel(result: string | null): { text: string; color: string } {
  if (result === 'pass') return { text: 'PASS', color: '#16a34a' }
  if (result === 'fail') return { text: 'FAIL', color: '#dc2626' }
  if (result === 'na') return { text: 'N/A', color: '#9ca3af' }
  return { text: 'PENDING', color: '#6b7280' }
}

export default function AcknowledgementReceipt({ workOrder, recordHash }: Props) {
  const asset = workOrder.ppm_schedules?.assets
  const site = asset?.buildings?.sites
  const checklist = (workOrder.checklist_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  )
  const ref = `${workOrder.wo_number}-SIGNED-${workOrder.signed_at ? format(new Date(workOrder.signed_at), 'yyyyMMdd') : 'PENDING'}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Marajo Property Management</Text>
            <Text style={styles.headerSub}>FacilityPPM — Maintenance Acknowledgement Receipt</Text>
          </View>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ VERIFIED &amp; SIGNED</Text>
          </View>
        </View>

        {/* Reference row */}
        <View style={styles.refRow}>
          <View>
            <Text style={styles.refLabel}>Reference Number</Text>
            <Text style={[styles.refValue, { fontFamily: 'Helvetica-Bold' }]}>{ref}</Text>
          </View>
          <View>
            <Text style={styles.refLabel}>Work Order</Text>
            <Text style={styles.refValue}>{workOrder.wo_number}</Text>
          </View>
          <View>
            <Text style={styles.refLabel}>Signed At</Text>
            <Text style={styles.refValue}>
              {workOrder.signed_at
                ? format(new Date(workOrder.signed_at), 'dd MMM yyyy HH:mm')
                : '—'}
            </Text>
          </View>
          <View>
            <Text style={styles.refLabel}>Status</Text>
            <Text style={[styles.refValue, { color: '#16a34a', fontFamily: 'Helvetica-Bold' }]}>
              VERIFIED
            </Text>
          </View>
        </View>

        {/* Property & WO details */}
        <Text style={styles.sectionTitle}>Property &amp; Work Order Details</Text>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Property</Text>
            <Text style={styles.value}>{site?.name ?? '—'}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Address</Text>
            <Text style={styles.value}>{site ? `${site.address}, ${site.city}` : '—'}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Asset</Text>
            <Text style={styles.value}>{asset?.name ?? '—'}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.value}>{asset?.location ?? '—'}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Assigned Engineer</Text>
            <Text style={styles.value}>{workOrder.engineers?.full_name ?? '—'}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Scheduled Date</Text>
            <Text style={styles.value}>
              {workOrder.scheduled_date
                ? format(new Date(workOrder.scheduled_date), 'dd MMM yyyy')
                : '—'}
            </Text>
          </View>
        </View>

        {/* Checklist */}
        <Text style={styles.sectionTitle}>Completed Checklist ({checklist.length} items)</Text>
        {checklist.map((item) => {
          const res = resultLabel(item.result)
          return (
            <View key={item.id} style={styles.checklistRow}>
              <Text style={styles.checklistDesc}>{item.description}</Text>
              {item.remarks ? (
                <Text style={[styles.checklistDesc, { color: '#6b7280' }]}>
                  {' '}— {item.remarks}
                </Text>
              ) : null}
              <Text style={[styles.checklistResult, { color: res.color }]}>{res.text}</Text>
            </View>
          )
        })}

        {/* Signature */}
        <Text style={styles.sectionTitle}>Tenant Sign-Off</Text>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Signed By</Text>
            <Text style={styles.value}>{workOrder.signed_by_name ?? '—'}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Confirmation</Text>
            <Text style={styles.value}>
              &quot;I confirm the services above were completed to my satisfaction.&quot;
            </Text>
          </View>
        </View>

        {workOrder.signature_data && (
          <View style={styles.signatureBox}>
            <Image src={workOrder.signature_data} style={styles.signatureImage} />
          </View>
        )}

        {/* Audit trail */}
        <View style={styles.auditBox}>
          <Text style={styles.auditTitle}>Audit Trail</Text>
          <View style={styles.auditRow}>
            <Text style={styles.auditLabel}>Signature timestamp:</Text>
            <Text style={styles.auditValue}>
              {workOrder.signed_at ? format(new Date(workOrder.signed_at), 'dd MMM yyyy HH:mm:ss') : '—'}
            </Text>
          </View>
          <View style={styles.auditRow}>
            <Text style={styles.auditLabel}>IP address:</Text>
            <Text style={styles.auditValue}>{workOrder.signed_by_ip ?? '—'}</Text>
          </View>
          <View style={styles.auditRow}>
            <Text style={styles.auditLabel}>Device / User Agent:</Text>
            <Text style={styles.auditValue}>{(workOrder.signed_by_device ?? '—').slice(0, 80)}</Text>
          </View>
          <View style={styles.auditRow}>
            <Text style={styles.auditLabel}>Record hash (SHA-256):</Text>
            <Text style={styles.auditValue}>{recordHash}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            This is a tamper-evident document generated by FacilityPPM. Any alteration renders
            it invalid. Reference: {ref} · © {new Date().getFullYear()} Marajo Property Management
          </Text>
        </View>
      </Page>
    </Document>
  )
}
