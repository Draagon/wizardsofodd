CREATE TABLE councils (
  id TEXT PRIMARY KEY NOT NULL,
  visitor_id TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL,
  verdict TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE council_turns (
  council_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  wizard_id TEXT NOT NULL,
  wizard_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (council_id, ordinal),
  FOREIGN KEY (council_id) REFERENCES councils(id) ON DELETE CASCADE
);
