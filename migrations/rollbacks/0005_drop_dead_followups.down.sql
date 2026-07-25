-- Reverse of 0005_drop_dead_followups.sql: recreate council_followups with the
-- schema from 0004_followup_rounds.sql. Does NOT restore the dropped demo row.
CREATE TABLE council_followups (
  council_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  question TEXT NOT NULL,
  targets_json TEXT NOT NULL,
  all_targets INTEGER NOT NULL,
  verdict_stance TEXT CHECK (verdict_stance IN ('yes','no','it_depends','unanswerable')),
  verdict_confidence REAL,
  verdict_markdown TEXT,
  verdict_evidence_quality TEXT CHECK (verdict_evidence_quality IN ('strong','mixed','thin','none')),
  dissents_json TEXT,
  verdict_agreements_json TEXT,
  verdict_splits_json TEXT,
  verdict_verify_note TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (council_id, round),
  FOREIGN KEY (council_id) REFERENCES councils(id) ON DELETE CASCADE
);
