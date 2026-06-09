-- Add a UNIQUE constraint on work_order_completion_evidence.work_order_id
-- so that upsert({ onConflict: 'work_order_id' }) works correctly.
-- Each work order has at most one completion-evidence record.
ALTER TABLE work_order_completion_evidence
  ADD CONSTRAINT work_order_completion_evidence_work_order_id_key
  UNIQUE (work_order_id);
