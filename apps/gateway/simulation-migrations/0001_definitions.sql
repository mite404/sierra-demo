CREATE TABLE simulation_definitions (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  PRIMARY KEY (id, revision)
);
