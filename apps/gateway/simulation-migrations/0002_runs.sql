CREATE TABLE simulation_run_handles (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  evidence_hash TEXT,
  completed_at TEXT
);

CREATE TABLE simulation_runs (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE REFERENCES simulation_run_handles(id),
  definition_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK (json_valid(evidence)),
  review TEXT NOT NULL CHECK (json_valid(review))
);

CREATE INDEX simulation_runs_latest ON simulation_runs (definition_id, completed_at DESC, sequence DESC);
