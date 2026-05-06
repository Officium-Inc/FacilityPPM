export type LicenseStatus = 'active' | 'suspended' | 'trial'

export interface Property {
  id: string
  slug: string
  name: string
  license_status: LicenseStatus
  created_at: string
}

export type WorkOrderStatus =
  | 'scheduled'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'verified'
  | 'cancelled'
  | 'overdue'

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
