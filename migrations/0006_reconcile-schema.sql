PRAGMA foreign_keys = OFF;

CREATE TABLE "__new_council_turns" (
  "council_id" VARCHAR(16) NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "round" INTEGER NOT NULL DEFAULT 0,
  "wizard_id" VARCHAR(32) NOT NULL,
  "wizard_name" VARCHAR(128) NOT NULL,
  "kind" TEXT NOT NULL,
  "stance" TEXT NOT NULL DEFAULT 'abstains',
  "take_markdown" TEXT NOT NULL,
  "one_line_summary" VARCHAR(140) NOT NULL,
  "confidence" REAL NOT NULL DEFAULT 0,
  "key_claims_json" TEXT NOT NULL DEFAULT '[]',
  "citations_json" TEXT,
  PRIMARY KEY ("council_id", "ordinal"),
  FOREIGN KEY ("council_id") REFERENCES "councils" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "council_turns_kind_chk" CHECK ("kind" IN ('wizard', 'error')),
  CONSTRAINT "council_turns_stance_chk" CHECK ("stance" IN ('supports', 'opposes', 'complicates', 'reframes', 'abstains')),
  CONSTRAINT "council_turns_confidence_numeric_chk" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

INSERT INTO "__new_council_turns" ("council_id", "ordinal", "round", "wizard_id", "wizard_name", "kind", "stance", "take_markdown", "one_line_summary", "confidence", "key_claims_json", "citations_json") SELECT "council_id", "ordinal", "round", "wizard_id", "wizard_name", "kind", "stance", "take_markdown", "one_line_summary", "confidence", "key_claims_json", "citations_json" FROM "council_turns";

DROP TABLE "council_turns";

ALTER TABLE "__new_council_turns" RENAME TO "council_turns";

PRAGMA foreign_keys = ON;

PRAGMA foreign_key_check;

PRAGMA foreign_keys = OFF;

CREATE TABLE "__new_councils" (
  "id" VARCHAR(8) PRIMARY KEY NOT NULL,
  "visitor_id" VARCHAR(64) NOT NULL,
  "question" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "verdict_stance" TEXT,
  "verdict_confidence" REAL,
  "verdict_markdown" TEXT,
  "verdict_evidence_quality" TEXT,
  "dissents_json" TEXT,
  "verdict_agreements_json" TEXT,
  "verdict_splits_json" TEXT,
  "verdict_verify_note" TEXT,
  "created_at" INTEGER NOT NULL,
  "completed_at" INTEGER,
  CONSTRAINT "councils_status_chk" CHECK ("status" IN ('pending', 'partial', 'complete', 'error')),
  CONSTRAINT "councils_verdict_stance_chk" CHECK ("verdict_stance" IN ('yes', 'no', 'it_depends', 'unanswerable')),
  CONSTRAINT "councils_verdict_evidence_quality_chk" CHECK ("verdict_evidence_quality" IN ('strong', 'mixed', 'thin', 'none'))
);

INSERT INTO "__new_councils" ("id", "visitor_id", "question", "status", "verdict_stance", "verdict_confidence", "verdict_markdown", "verdict_evidence_quality", "dissents_json", "verdict_agreements_json", "verdict_splits_json", "verdict_verify_note", "created_at", "completed_at") SELECT "id", "visitor_id", "question", "status", "verdict_stance", "verdict_confidence", "verdict_markdown", "verdict_evidence_quality", "dissents_json", "verdict_agreements_json", "verdict_splits_json", "verdict_verify_note", "created_at", "completed_at" FROM "councils";

DROP TABLE "councils";

ALTER TABLE "__new_councils" RENAME TO "councils";

PRAGMA foreign_keys = ON;

PRAGMA foreign_key_check;
