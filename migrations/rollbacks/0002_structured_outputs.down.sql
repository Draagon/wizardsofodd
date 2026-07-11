-- Reverse of 0002_structured_outputs.sql.
ALTER TABLE council_turns DROP COLUMN citations_json;
ALTER TABLE council_turns DROP COLUMN key_claims_json;
ALTER TABLE council_turns DROP COLUMN confidence;
ALTER TABLE council_turns DROP COLUMN one_line_summary;
ALTER TABLE council_turns DROP COLUMN take_markdown;
ALTER TABLE council_turns DROP COLUMN stance;
ALTER TABLE council_turns ADD COLUMN text TEXT NOT NULL DEFAULT '';

ALTER TABLE councils DROP COLUMN dissents_json;
ALTER TABLE councils DROP COLUMN verdict_evidence_quality;
ALTER TABLE councils DROP COLUMN verdict_markdown;
ALTER TABLE councils DROP COLUMN verdict_confidence;
ALTER TABLE councils DROP COLUMN verdict_stance;
ALTER TABLE councils ADD COLUMN verdict TEXT;
