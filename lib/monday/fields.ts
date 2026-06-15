export type MondayFieldKind = 'text' | 'status' | 'date' | 'number' | 'files' | 'link'

export interface MondayFieldDefinition {
  id: string
  label: string
  kind: MondayFieldKind
  compatibleTypes: string[]
}

export interface MondayFieldMapping {
  fieldId: string
  columnId: string
  columnType?: string
  columnTitle?: string
}

export const MONDAY_FIELD_DEFINITIONS: MondayFieldDefinition[] = [
  { id: 'property', label: 'Property', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'billing_status', label: 'Billing Status', kind: 'status', compatibleTypes: ['status'] },
  { id: 'approval_or_waiver_date', label: 'Approval/Waiver Date', kind: 'date', compatibleTypes: ['date'] },
  { id: 'grand_total', label: 'Grand Total', kind: 'number', compatibleTypes: ['numbers'] },
  { id: 'attachments', label: 'Attachments', kind: 'files', compatibleTypes: ['file'] },
  { id: 'facilityppm_link', label: 'FacilityPPM Link', kind: 'link', compatibleTypes: ['link', 'text', 'long_text'] },
  { id: 'workflow_status', label: 'Workflow Status', kind: 'status', compatibleTypes: ['status'] },
  { id: 'type', label: 'Type', kind: 'status', compatibleTypes: ['status', 'text', 'long_text'] },
  { id: 'priority', label: 'Priority', kind: 'status', compatibleTypes: ['status', 'text', 'long_text'] },
  { id: 'engineer', label: 'Engineer', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'asset', label: 'Asset', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'building', label: 'Building', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'site', label: 'Site', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'scheduled_date', label: 'Scheduled Date', kind: 'date', compatibleTypes: ['date'] },
  { id: 'due_date', label: 'Due Date', kind: 'date', compatibleTypes: ['date'] },
  { id: 'completed_date', label: 'Completed Date', kind: 'date', compatibleTypes: ['date'] },
  { id: 'tenant_name', label: 'Tenant Name', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'tenant_email', label: 'Tenant Email', kind: 'text', compatibleTypes: ['email', 'text', 'long_text'] },
  { id: 'cost_approved_by', label: 'Cost Approved By', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'waived_by', label: 'Waived By', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'waiver_reason', label: 'Waiver Reason', kind: 'text', compatibleTypes: ['text', 'long_text'] },
  { id: 'notes', label: 'Notes', kind: 'text', compatibleTypes: ['long_text', 'text'] },
]

export function getMondayFieldDefinition(fieldId: string) {
  return MONDAY_FIELD_DEFINITIONS.find((field) => field.id === fieldId) ?? null
}

export function isColumnCompatible(fieldId: string, columnType: string) {
  const field = getMondayFieldDefinition(fieldId)
  return Boolean(field?.compatibleTypes.includes(columnType))
}
