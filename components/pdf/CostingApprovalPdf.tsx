import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 36,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#15803d',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  headerSub: { fontSize: 9, color: '#bbf7d0', marginTop: 2 },
  approvedBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  approvedBadgeText: { color: '#15803d', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  refRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 4,
  },
  refBox: { flex: 1 },
  refLabel: { fontSize: 7, color: '#6b7280', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  refValue: { fontSize: 9, color: '#111827', marginTop: 2 },
  section: {
    marginBottom: 10,
    border: '1pt solid #e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: '#f9fafb',
    padding: '6 10',
    borderBottom: '1pt solid #e5e7eb',
  },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { padding: '8 10' },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1pt solid #f3f4f6',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableLastRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableLabelCol: { flex: 3, fontSize: 9, color: '#374151' },
  tableValueCol: { flex: 1, fontSize: 9, color: '#111827', textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    padding: '6 4',
    borderTop: '1.5pt solid #16a34a',
    marginTop: 2,
    borderRadius: 2,
  },
  totalLabel: { flex: 3, fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#15803d' },
  totalValue: { flex: 1, fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#15803d', textAlign: 'right' },
  approvalSection: {
    marginTop: 8,
    padding: '8 10',
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    border: '1pt solid #bbf7d0',
  },
  approvalTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#15803d', textTransform: 'uppercase', marginBottom: 4 },
  approvalRow: { flexDirection: 'row', marginBottom: 3 },
  approvalLabel: { width: 130, fontSize: 8, color: '#166534', fontFamily: 'Helvetica-Bold' },
  approvalValue: { flex: 1, fontSize: 8, color: '#166534' },
  notesText: { fontSize: 8, color: '#6b7280', marginTop: 4, fontStyle: 'italic' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1pt solid #e5e7eb',
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: '#9ca3af' },
})

interface Props {
  woNumber: string
  propertyName: string
  siteName?: string | null
  labourHours: number
  labourRate: number
  labourTotal: number
  materialsTotal: number
  subcontractorTotal: number
  grandTotal: number
  notes?: string | null
  approvedByName?: string | null
  approvedAt?: string | null
  generatedAt: string
}

function formatPeso(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(d)) + ' PHT'
}

export default function CostingApprovalPdf({
  woNumber, propertyName, siteName,
  labourHours, labourRate, labourTotal, materialsTotal, subcontractorTotal, grandTotal,
  notes, approvedByName, approvedAt, generatedAt,
}: Props) {
  return (
    <Document title={`Cost Estimate — ${woNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Cost Estimate</Text>
            <Text style={styles.headerSub}>{woNumber} · {propertyName}</Text>
          </View>
          {approvedByName && (
            <View style={styles.approvedBadge}>
              <Text style={styles.approvedBadgeText}>APPROVED</Text>
            </View>
          )}
        </View>

        {/* Reference row */}
        <View style={styles.refRow}>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Work Order</Text>
            <Text style={styles.refValue}>{woNumber}</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Property</Text>
            <Text style={styles.refValue}>{propertyName}</Text>
          </View>
          {siteName && (
            <View style={styles.refBox}>
              <Text style={styles.refLabel}>Site</Text>
              <Text style={styles.refValue}>{siteName}</Text>
            </View>
          )}
          {approvedAt && (
            <View style={styles.refBox}>
              <Text style={styles.refLabel}>Approved On</Text>
              <Text style={styles.refValue}>{formatDate(approvedAt)}</Text>
            </View>
          )}
        </View>

        {/* Cost Breakdown */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Cost Breakdown</Text>
          </View>
          <View style={styles.sectionBody}>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCol}>Labour ({labourHours}h × {formatPeso(labourRate)}/h)</Text>
              <Text style={styles.tableValueCol}>{formatPeso(labourTotal)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCol}>Materials</Text>
              <Text style={styles.tableValueCol}>{formatPeso(materialsTotal)}</Text>
            </View>
            <View style={styles.tableLastRow}>
              <Text style={styles.tableLabelCol}>Subcontractor</Text>
              <Text style={styles.tableValueCol}>{formatPeso(subcontractorTotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Grand Total</Text>
              <Text style={styles.totalValue}>{formatPeso(grandTotal)}</Text>
            </View>
            {notes && <Text style={styles.notesText}>Note: {notes}</Text>}
          </View>
        </View>

        {/* Approval Section */}
        {approvedByName && (
          <View style={styles.approvalSection}>
            <Text style={styles.approvalTitle}>Approval Record</Text>
            <View style={styles.approvalRow}>
              <Text style={styles.approvalLabel}>Approved By</Text>
              <Text style={styles.approvalValue}>{approvedByName}</Text>
            </View>
            <View style={styles.approvalRow}>
              <Text style={styles.approvalLabel}>Approved On</Text>
              <Text style={styles.approvalValue}>{formatDate(approvedAt)}</Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>FacilityPPM · Cost Estimate · {woNumber}</Text>
          <Text style={styles.footerText}>Generated {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
