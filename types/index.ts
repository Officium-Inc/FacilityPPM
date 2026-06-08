export type LicenseStatus = 'active' | 'suspended' | 'trial'

export interface Property {
  id: string
  slug: string
  name: string
  license_status: LicenseStatus
  created_at: string
}

export type WorkOrderStatus =
  // Legacy statuses (kept for backwards compatibility)
  | 'scheduled'
  | 'on_hold'
  | 'cancelled'
  | 'overdue'
  // New workflow statuses
  | 'new_report'
  | 'inspecting'
  | 'costing'
  | 'pending_approval'
  | 'assigned'
  | 'in_progress'
  | 'svc_submitted'
  | 'signed'
  | 'verified'
  | 'completed'

export type WorkOrderType = 'ppm' | 'reactive' | 'statutory' | 'project'
export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type ChecklistResult = 'pass' | 'fail' | 'na' | null

export interface Site {
  id: string
  property_id: string
  name: string
  address: string | null
  city: string | null
  manager_name: string | null
  created_at: string
  properties?: Property
}

export interface Building {
  id: string
  site_id: string
  name: string
  floors: number | null
  created_at: string
  sites?: Site
}

export interface Asset {
  id: string
  building_id: string
  name: string
  category: string | null
  make: string | null
  model: string | null
  serial_no: string | null
  install_date: string | null
  warranty_expiry: string | null
  location: string | null
  status: 'active' | 'inactive' | 'under_repair' | 'decommissioned'
  qr_code: string | null
  created_at: string
  buildings?: Building
}

export interface Role {
  id: string
  name: 'admin' | 'supervisor' | 'engineer' | 'viewer'
  permissions: Record<string, unknown>
}

export interface Engineer {
  id: string
  property_id: string | null
  user_id: string | null
  role_id: string | null
  full_name: string
  email: string
  phone: string | null
  certifications: string | null
  is_active: boolean
  created_at: string
  roles?: Role
}

export interface PpmSchedule {
  id: string
  asset_id: string
  title: string
  frequency: string | null
  interval_days: number | null
  next_due: string | null
  priority: Priority
  is_active: boolean
  created_at: string
  assets?: Asset
}

export interface ChecklistItem {
  id: string
  work_order_id: string
  description: string
  result: ChecklistResult
  remarks: string | null
  requires_photo: boolean
  photo_urls: string[]
  sort_order: number
  created_at: string
}

export interface WorkOrder {
  id: string
  property_id: string | null
  schedule_id: string | null
  engineer_id: string | null
  wo_number: string
  type: WorkOrderType
  status: WorkOrderStatus
  scheduled_date: string | null
  completed_date: string | null
  notes: string | null
  priority: Priority
  sign_off_token: string | null
  sign_off_expires_at: string | null
  signed_at: string | null
  signed_by_name: string | null
  signed_by_ip: string | null
  signed_by_device: string | null
  signature_data: string | null
  rejection_reason: string | null
  pdf_url: string | null
  // Workflow v2 fields
  report_id: string | null
  costing_token: string | null
  costing_token_expires_at: string | null
  costing_approved_at: string | null
  costing_approved_by_name: string | null
  costing_approval_signature: string | null
  head_engineer_id: string | null
  head_engineer_verified_at: string | null
  head_engineer_notes: string | null
  due_date: string | null
  assignment_instructions: string | null
  hours_logged: number | null
  rating: number | null
  rating_comment: string | null
  created_at: string
  updated_at: string
  engineers?: Engineer | null
  ppm_schedules?: (PpmSchedule & { assets?: Asset & { buildings?: Building & { sites?: Site } } }) | null
  checklist_items?: ChecklistItem[]
}

export interface InventoryItem {
  id: string
  property_id: string | null
  part_name: string
  part_number: string | null
  category: string | null
  qty_on_hand: number
  reorder_level: number
  supplier: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  property_id: string | null
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

// ── Workflow v2 types ──────────────────────────────────────────

export interface WorkOrderReport {
  id: string
  work_order_id: string | null
  fault_description: string
  location_notes: string | null
  reported_by_name: string
  reported_by_contact: string | null
  urgency: Priority
  photo_urls: string[]
  inspection_notes: string | null
  root_cause: string | null
  scope_of_work: string | null
  inspection_photo_urls: string[]
  inspected_by_id: string | null
  inspected_at: string | null
  created_at: string
}

export interface CostingLineItem {
  description: string
  qty: number
  unit_cost: number
}

export interface WorkOrderCosting {
  id: string
  work_order_id: string
  labour_hours: number
  labour_rate: number
  labour_total: number
  materials_total: number
  subcontractor_total: number
  grand_total: number
  line_items: CostingLineItem[]
  notes: string | null
  submitted_by_id: string | null
  submitted_at: string
  created_at: string
}

export interface WorkOrderCompletionEvidence {
  id: string
  work_order_id: string
  work_description: string
  completion_photo_urls: string[]
  supporting_doc_urls: string[]
  submitted_by_id: string | null
  submitted_at: string
  created_at: string
}

export interface ServiceRating {
  id: string
  work_order_id: string
  rated_engineer_id: string | null
  rating: number
  comment: string | null
  submitted_by_name: string | null
  rated_at: string
}

export interface ApprovalTrailEntry {
  id: string
  work_order_id: string
  stage: 'costing_approval' | 'sign_off' | 'final_verification'
  actor_name: string
  actor_role: 'tenant' | 'engineer' | 'head_engineer'
  decision: 'approved' | 'rejected'
  reason: string | null
  signature_data: string | null
  ip_address: string | null
  created_at: string
}
