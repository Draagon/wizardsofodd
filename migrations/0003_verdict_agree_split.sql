-- councils: honest-verdict map — convergence/split lists + a verify-this note (W3).
-- All nullable: pre-W3 councils and the verdict fallback may omit them.
ALTER TABLE councils ADD COLUMN verdict_agreements_json TEXT;
ALTER TABLE councils ADD COLUMN verdict_splits_json TEXT;
ALTER TABLE councils ADD COLUMN verdict_verify_note TEXT;
