// The design tooling page's evidence (ADR-160): the numbers, the beats of a run, the transcript
// and the rows the page lays out, the tool's own words rather than copy. Ethan's copy is in the
// components, and the copy it replaced is kept in docs/reference/verify-ui-tooling-copy.md.

/** Where the page's pictures live, under public/, with their credits beside them. */
export const PICTURES = "/verify-ui-tooling";

/** A run's shape in numbers, as the review app's summary row puts it. */
export const STATS = [
  { label: "Rendering engines", value: "3" },
  { label: "Stories in the inventory", value: "85" },
  { label: "References CI can approve", value: "0" },
];

/** The five beats of a run, in order, by name. */
export const STEPS = ["Capture", "Prove the camera", "Compare", "Check", "Decide and keep"];

/** How the tool works, in four steps, beside the Pixels picture. */
export const HOW = [
  {
    lead: "Capture screenshots in batch",
    rest: ". One command renders every Storybook story in Chromium, Firefox and WebKit, light and dark.",
  },
  {
    lead: "Compare before and after",
    rest: " pixel by pixel against an approved baseline, with a split wipe and a 4x inspector that show exactly what moved.",
  },
  {
    lead: "Check contrast and accessibility",
    rest: " across the three major browser engines. Every token pair measured, axe run on every story.",
  },
  {
    lead: "Fail loudly",
    rest: ". If pixels or colours land anywhere but the baseline, the run fails. A missing reference is never a pass, and only a person can approve a new one.",
  },
];

/** The shell the terminal picture showed: its window, its prompt bar, and the command typed. */
export const SHELL = {
  title: "yaklabs — zsh",
  path: "~/Programming/web/fractal/yaklabs/apps",
  branch: "main",
  time: "01:36:08 AM",
  program: "pnpm",
  args: "verify-ui-drift run",
};

/** The comparator proof's counts for each engine, as the review app tabled them. */
export const PROOF = [
  { engine: "chromium", control: 0, color: 7735, geometry: 15600 },
  { engine: "firefox", control: 0, color: 7740, geometry: 16497 },
  { engine: "webkit", control: 0, color: 8023, geometry: 15863 },
];

/** Four measured token pairs under the Kay lens, light appearance, with the minimum each clears. */
export const PAIRS = [
  { pair: "--ink on --paper", ratio: 13.33, minimum: 4.5 },
  { pair: "--soft-ink on --paper", ratio: 6.42, minimum: 4.5 },
  { pair: "--rule on --paper", ratio: 5.68, minimum: 3 },
  { pair: "--focus on --paper", ratio: 3.01, minimum: 3 },
];

/** The run the terminal picture showed, as the CLI printed it, with the home path shortened. */
export const RUN = {
  command: "pnpm verify-ui-drift run",
  lines: [
    "> yaklabs@ verify-ui-drift ~/yaklabs",
    "> pnpm --filter verify-ui-drift cli run",
    "",
    "> verify-ui-drift@ cli ~/yaklabs/tools/verify-ui-drift",
    "> node src/cli.ts run",
    "",
    "Building current Storybook for bee310fdcbe6",
  ],
  notice:
    "No approved references exist for this machine (darwin-arm64), so captures are recorded but not compared. References exist for: linux-x64-debian-12.",
  rest: [
    "chromium proof ok: control 0, color 7735, geometry 15600",
    "foundations-button--default.chromium.light missing-baseline axe=0",
    "foundations-text-field--on-paper.chromium.light missing-baseline axe=0",
    "foundations-text-field--inside-recap-and-needs-you.chromium.light missing-baseline axe=0",
    "foundations-disclosure--folded.chromium.light missing-baseline axe=0",
    "foundations-disclosure--open.chromium.light missing-baseline axe=0",
    "firefox proof ok: control 0, color 7740, geometry 16497",
    "foundations-button--default.firefox.light missing-baseline axe=0",
    "webkit proof ok: control 0, color 8023, geometry 15863",
    "foundations-button--default.webkit.light missing-baseline axe=0",
    "…",
  ],
};

/** The four verdicts, from the tool's README. */
export const VERDICTS = [
  {
    verdict: "PASS",
    exit: "0",
    meaning: "Every capture matches its reference and axe found nothing.",
  },
  {
    verdict: "FAIL",
    exit: "1",
    meaning: "Captures changed or axe found violations. Each one is listed.",
  },
  {
    verdict: "INCOMPLETE",
    exit: "2",
    meaning:
      "Part of the run was not compared: no reference for this machine, an engine that did not run, or a failed camera proof.",
  },
  {
    verdict: "BROKEN",
    exit: "3",
    meaning: "The run did not finish cleanly. The cause is printed.",
  },
];

/** Rows of the results list on a machine with no references of its own. */
export const MISSING = [
  { story: "Button / Default", engine: "firefox", theme: "dark" },
  { story: "Text Field / On Paper", engine: "firefox", theme: "dark" },
  { story: "Disclosure / Open", engine: "firefox", theme: "dark" },
];
