import {
  savedSimulationDefinition,
  simulationHumanReview,
  simulationRunEvidence,
  type SavedSimulationDefinition,
  type SimulationDraft,
  type SimulationRun,
  type SimulationRunEvidence,
} from "./simulationContract";

/** Reads the latest approved revision, or a specific immutable revision. Storage failures propagate.
 * @throws If D1 fails or a stored snapshot violates the shared contract.
 */
export async function readSimulationDefinition(
  db: D1Database,
  id: string,
  revision?: number,
): Promise<SavedSimulationDefinition | null> {
  const query =
    revision === undefined
      ? db
          .prepare(
            "SELECT snapshot FROM simulation_definitions WHERE id = ? ORDER BY revision DESC LIMIT 1",
          )
          .bind(id)
      : db
          .prepare("SELECT snapshot FROM simulation_definitions WHERE id = ? AND revision = ?")
          .bind(id, revision);
  const snapshot = await query.first<string>("snapshot");
  return snapshot === null ? null : savedSimulationDefinition.parse(JSON.parse(snapshot));
}

/** Lists one latest approved snapshot per definition, independently of ephemeral sessions and model keys.
 * @throws If D1 fails or a stored snapshot violates the shared contract.
 */
export async function listSimulationDefinitions(
  db: D1Database,
): Promise<SavedSimulationDefinition[]> {
  const rows = await db
    .prepare(`SELECT snapshot FROM simulation_definitions AS d
    WHERE revision = (SELECT MAX(revision) FROM simulation_definitions WHERE id = d.id)
    ORDER BY id`)
    .all<{ snapshot: string }>();
  return rows.results.map((row) => savedSimulationDefinition.parse(JSON.parse(row.snapshot)));
}

/** Appends only if the latest revision still matches the reviewed draft. Null means a stale save.
 * @throws If D1 cannot commit the revision. No previous snapshots are modified.
 */
export async function saveSimulationDefinition(
  db: D1Database,
  draft: SimulationDraft,
): Promise<SavedSimulationDefinition | null> {
  const saved: SavedSimulationDefinition = {
    id: draft.definitionId,
    revision: draft.expectedRevision + 1,
    definition: draft.definition,
    workflow: draft.workflow,
    createdAt: draft.createdAt,
    savedAt: new Date().toISOString(),
  };
  // The comparison and append are one SQLite statement, including when different drafts race.
  const result = await db
    .prepare(`INSERT INTO simulation_definitions (id, revision, snapshot)
    SELECT ?, ?, ? WHERE COALESCE((SELECT MAX(revision) FROM simulation_definitions WHERE id = ?), 0) = ?`)
    .bind(saved.id, saved.revision, JSON.stringify(saved), saved.id, draft.expectedRevision)
    .run();
  return result.meta.changes === 1 ? saved : null;
}

/** Claims a handle once, even across restarts. A prior unfinished handle is never replayed.
 * @throws If local storage fails.
 */
export async function reserveSimulationRun(
  db: D1Database,
  id: string,
  saved: SavedSimulationDefinition,
): Promise<boolean> {
  const receipt = await db
    .prepare(`INSERT OR IGNORE INTO simulation_run_handles
    (id, definition_id, revision) SELECT ?, ?, ?
    WHERE (SELECT MAX(revision) FROM simulation_definitions WHERE id = ?) = ?`)
    .bind(id, saved.id, saved.revision, saved.id, saved.revision)
    .run();
  return receipt.meta.changes === 1;
}

const runFromRow = (row: { evidence: string; review: string }): SimulationRun => {
  const evidence = simulationRunEvidence.parse(JSON.parse(row.evidence));
  return {
    id: evidence.id,
    active: false,
    persistence: "saved",
    evidence,
    humanReview: simulationHumanReview.parse(JSON.parse(row.review)),
  };
};

/** Reads immutable completed evidence and the independent latest human review.
 * @throws If storage fails or persisted evidence violates its contract.
 */
export async function readSimulationRun(db: D1Database, id: string): Promise<SimulationRun | null> {
  const row = await db
    .prepare("SELECT evidence, review FROM simulation_runs WHERE id = ?")
    .bind(id)
    .first<{ evidence: string; review: string }>();
  return row ? runFromRow(row) : null;
}

/** Returns newest-first completions across all revisions, at most two per saved test.
 * @throws If storage fails or persisted evidence violates its contract.
 */
export async function listSimulationRuns(
  db: D1Database,
  definitionId: string,
): Promise<SimulationRun[]> {
  const rows = await db
    .prepare(`SELECT evidence, review FROM simulation_runs
    WHERE definition_id = ? ORDER BY completed_at DESC, sequence DESC LIMIT 2`)
    .bind(definitionId)
    .all<{ evidence: string; review: string }>();
  return rows.results.map(runFromRow);
}

/** Commits and prunes atomically. Returns whether the evidence remains among the newest two.
 * Receipts prevent redelivery from resurrecting evicted runs.
 * @throws On incomplete evidence, changed redelivery, or any failed atomic storage operation.
 */
export async function saveSimulationRun(
  db: D1Database,
  evidence: SimulationRunEvidence,
): Promise<boolean> {
  const { result } = evidence;
  if (result.status !== "completed" || !result.simulation || evidence.completedAt === null)
    throw new Error("Only whole completed scenarios may be saved");
  const serialized = JSON.stringify(simulationRunEvidence.parse(evidence));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  await db.batch([
    db
      .prepare(`UPDATE simulation_run_handles SET evidence_hash = ?, completed_at = ?
      WHERE id = ? AND definition_id = ? AND revision = ? AND evidence_hash IS NULL`)
      .bind(
        hash,
        evidence.completedAt,
        evidence.id,
        result.simulation.id,
        result.simulation.revision,
      ),
    db
      .prepare(`INSERT INTO simulation_runs (id, definition_id, completed_at, evidence, review)
      SELECT ?, ?, ?, ?, ? WHERE changes() = 1`)
      .bind(
        evidence.id,
        result.simulation.id,
        evidence.completedAt,
        serialized,
        JSON.stringify({ status: "pending", note: "" }),
      ),
    db
      .prepare(`DELETE FROM simulation_runs WHERE definition_id = ? AND changes() = 1 AND id NOT IN
      (SELECT id FROM simulation_runs WHERE definition_id = ? ORDER BY completed_at DESC, sequence DESC LIMIT 2)`)
      .bind(result.simulation.id, result.simulation.id),
  ]);
  const committed = await db
    .prepare("SELECT evidence_hash FROM simulation_run_handles WHERE id = ?")
    .bind(evidence.id)
    .first<string>("evidence_hash");
  if (committed !== hash) throw new Error("Run handle or immutable evidence conflict");
  const retained = await db
    .prepare("SELECT id FROM simulation_runs WHERE id = ?")
    .bind(evidence.id)
    .first<string>("id");
  return retained !== null;
}

/** Updates only human judgment, never model/tool evidence. False means no retained completion.
 * @throws If storage fails.
 */
export async function reviewSimulationRun(
  db: D1Database,
  id: string,
  review: SimulationRun["humanReview"],
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE simulation_runs SET review = ? WHERE id = ?")
    .bind(JSON.stringify(review), id)
    .run();
  return result.meta.changes === 1;
}
