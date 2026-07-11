-- council_turns: replace text with structured columns.
ALTER TABLE council_turns DROP COLUMN text;
ALTER TABLE council_turns ADD COLUMN stance TEXT NOT NULL DEFAULT 'abstains' CHECK (stance IN ('supports','opposes','complicates','reframes','abstains'));
ALTER TABLE council_turns ADD COLUMN take_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE council_turns ADD COLUMN one_line_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE council_turns ADD COLUMN confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE council_turns ADD COLUMN key_claims_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE council_turns ADD COLUMN citations_json TEXT;

-- councils: replace verdict (free text) with structured verdict columns.
ALTER TABLE councils DROP COLUMN verdict;
ALTER TABLE councils ADD COLUMN verdict_stance TEXT CHECK (verdict_stance IN ('yes','no','it_depends','unanswerable'));
ALTER TABLE councils ADD COLUMN verdict_confidence REAL;
ALTER TABLE councils ADD COLUMN verdict_markdown TEXT;
ALTER TABLE councils ADD COLUMN verdict_evidence_quality TEXT CHECK (verdict_evidence_quality IN ('strong','mixed','thin','none'));
ALTER TABLE councils ADD COLUMN dissents_json TEXT;
