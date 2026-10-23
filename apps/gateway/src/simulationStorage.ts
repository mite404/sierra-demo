import {
  savedSimulationDefinition,
  type SavedSimulationDefinition,
  type SimulationDraft,
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
