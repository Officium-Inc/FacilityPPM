/** Columns every work order query must select before calling `authorize`/`can` with the row as the record. */
export const WORK_ORDER_SCOPE_COLUMNS = 'id, property_id, engineer_id, requested_by_id, tenant_email, company_id'
