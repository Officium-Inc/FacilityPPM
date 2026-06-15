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
    backgroundColor: '#1d4ed8',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  headerSub: { fontSize: 9, color: '#bfdbfe', marginTop: 2 },
  typeBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  typeBadgeText: { color: '#1d4ed8', fontSize: 8, fontFamily: 'Helvetica-Bold' },
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
  row: { flexDirection: 'row', marginBottom: 5 },
  label: { width: 130, fontSize: 8, color: '#6b7280', fontFamily: 'Helvetica-Bold' },
  value: { flex: 1, fontSize: 9, color: '#111827' },
  divider: { borderBottom: '1pt solid #e5e7eb', marginVertical: 6 },
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

interface ReportData {
  fault_description?: string | null
  location_notes?: string | null
  reported_by_name?: string | null
  reported_by_contact?: string | null
  urgency?: string | null
  inspection_notes?: string | null
  root_cause?: string | null
  scope_of_work?: string | null
  inspected_at?: string | null
}

interface Props {
  woNumber: string
  propertyName: string
  assetName?: string | null
  buildingName?: string | null
  siteName?: string | null
  createdAt: string
  report: ReportData
  generatedAt: string
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(d)) + ' PHT'
}

export default function ServiceReportPdf({
  woNumber, propertyName, assetName, buildingName, siteName, createdAt, report, generatedAt,
}: Props) {
  const hasInspection = !!report.inspection_notes

  return (
    <Document title={`Service Report — ${woNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Service Report</Text>
            <Text style={styles.headerSub}>{woNumber} · {propertyName}</Text>
          </View>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{hasInspection ? 'INSPECTION COMPLETE' : 'FAULT REPORTED'}</Text>
          </View>
        </View>

        {/* Reference row */}
        <View style={styles.refRow}>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Work Order</Text>
            <Text style={styles.refValue}>{woNumber}</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Site</Text>
            <Text style={styles.refValue}>{siteName ?? '—'}</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Building</Text>
            <Text style={styles.refValue}>{buildingName ?? '—'}</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Asset</Text>
            <Text style={styles.refValue}>{assetName ?? '—'}</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Reported On</Text>
            <Text style={styles.refValue}>{formatDate(createdAt)}</Text>
          </View>
        </View>

        {/* Fault Report Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Fault Report</Text>
          </View>
          <View style={styles.sectionBody}>
            <View style={styles.row}>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.value}>{report.fault_description ?? '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Location</Text>
              <Text style={styles.value}>{report.location_notes ?? '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Reported By</Text>
              <Text style={styles.value}>{report.reported_by_name ?? '—'}</Text>
            </View>
            {report.reported_by_contact ? (
              <View style={styles.row}>
                <Text style={styles.label}>Contact</Text>
                <Text style={styles.value}>{report.reported_by_contact}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.label}>Urgency</Text>
              <Text style={styles.value}>{report.urgency ?? '—'}</Text>
            </View>
          </View>
        </View>

        {/* Inspection Findings Section */}
        {hasInspection && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Inspection Findings</Text>
            </View>
            <View style={styles.sectionBody}>
              <View style={styles.row}>
                <Text style={styles.label}>Inspection Notes</Text>
                <Text style={styles.value}>{report.inspection_notes}</Text>
              </View>
              {report.root_cause ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Root Cause</Text>
                  <Text style={styles.value}>{report.root_cause}</Text>
                </View>
              ) : null}
              {report.scope_of_work ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Scope of Work</Text>
                  <Text style={styles.value}>{report.scope_of_work}</Text>
                </View>
              ) : null}
              {report.inspected_at ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Inspected On</Text>
                  <Text style={styles.value}>{formatDate(report.inspected_at)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>FacilityPPM · Service Report · {woNumber}</Text>
          <Text style={styles.footerText}>Generated {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
