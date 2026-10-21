// The scripted demo's old addresses (ADR-148): `/demo/weekly-brief[?script=]` and its threads
// under `/demo/weekly-brief/t/:threadId`, which the shows now keep under `/t/`. The splat matches
// the bare address too, so this one module redirects them all before anything renders.
export { legacyRedirect as clientLoader } from "../world/redirects";
