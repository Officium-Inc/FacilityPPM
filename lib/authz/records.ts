import { scopeOf, type Action, type ActorLike } from './permissions'

/** Columns every work order query must select before calling `authorize`/`can` with the row as the record. */
export const WORK_ORDER_SCOPE_COLUMNS = 'id, property_id, engineer_id, requested_by_id, tenant_email, company_id'

/**
 * Restricts a work order list query (already filtered to the property) to the rows `actor` may see with
 * `permission`: property scope sees all, assigned scope only work assigned to them, company scope only their
 * company's. Returns null when the actor may see none (callers show an empty list).
 */
export function applyWorkOrderScope<Q extends { eq(column: string, value: string): Q }>(
  query: Q,
  actor: ActorLike,
  permission: Action = 'workRequest.view'
): Q | null {
  const scope = scopeOf(actor, permission)
  if (!scope) return null
  if (actor.kind === 'provider' || scope === 'property') return query
  if (scope === 'assigned') return actor.engineerId ? query.eq('engineer_id', actor.engineerId) : null
  if (scope === 'company') return actor.companyId ? query.eq('company_id', actor.companyId) : null
  return null
}
