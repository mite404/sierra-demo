import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { writeBaselines } from "./baselines.ts";
import {
  approvalCells,
  engineSchema,
  idSchema,
  reportSchema,
  themeSchema,
  verdict,
} from "./report.ts";
import { runVerification } from "./run.ts";
import { BASELINES, RUNS, sourceSnapshot } from "./workspace.ts";

const HELP = `yaklabs verification
  pnpm verify-ui-drift run [--stories id,id | --all | --since ref] [--app] [--engines chromium,firefox,webkit]
  pnpm verify-ui-drift selftest [--engines chromium,firefox,webkit]
  pnpm verify-ui-drift approve --run RUN --keys KEY,KEY --expect N
  pnpm verify-ui-drift review                 starts the read-only review app

Options: --themes light,dark, --baselines DIRECTORY
--app adds the production SPA demo composition to the selected stories.
Exit: 0 pass; 1 regression/accessibility failure; 2 incomplete evidence; 3 broken run.
Approval never happens during run or selftest. View the images before approving.
`;

const OPTIONS = {
  stories: { type: "string" },
  engines: { type: "string", default: "chromium,firefox,webkit" },
  themes: { type: "string", default: "light,dark" },
  all: { type: "boolean" },
  app: { type: "boolean" },
  since: { type: "string" },
  run: { type: "string" },
  keys: { type: "string" },
  expect: { type: "string" },
  baselines: { type: "string" },
  help: { type: "boolean" },
} as const;

type ParsedValues = ReturnType<
  typeof parseArgs<{ allowPositionals: true; options: typeof OPTIONS }>
>["values"];

async function runAction(action: "run" | "selftest", values: ParsedValues): Promise<void> {
  if ([values.all, values.since, values.stories].filter(Boolean).length > 1)
    throw new Error("Choose only one story selection.");
  const engines = engineSchema.array().min(1).parse(values.engines.split(","));
  const themes = themeSchema.array().min(1).parse(values.themes.split(","));
  if (new Set(engines).size !== engines.length || new Set(themes).size !== themes.length)
    throw new Error("Duplicate engine or theme.");
  const report = await runVerification({
    engines,
    themes,
    mode: action === "selftest" ? "selftest" : "comparison",
    stories: values.stories?.split(","),
    all: values.all,
    app: values.app,
    since: values.since,
    baselineDir: values.baselines ? path.resolve(values.baselines) : undefined,
  });
  process.exitCode = { pass: 0, fail: 1, incomplete: 2, broken: 3 }[verdict(report)];
}

async function approveAction(values: ParsedValues): Promise<void> {
  if (process.env.CI) throw new Error("Approval is disabled in CI.");
  const id = idSchema.parse(values.run);
  const runDir = path.join(RUNS, id);
  const report = reportSchema.parse(
    JSON.parse(await readFile(path.join(runDir, "report.json"), "utf8")),
  );
  const source = (await sourceSnapshot()).source;
  const cells = approvalCells(report, source, values.keys?.split(",") ?? [], Number(values.expect));
  await writeBaselines({
    cells,
    runDir,
    baselineDir: values.baselines ? path.resolve(values.baselines) : BASELINES,
    source,
    run: id,
  });
  process.stdout.write(`Approved ${cells.length} named captures. Run comparison again.\n`);
}

async function reviewAction(): Promise<void> {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.resolve(import.meta.dirname, "../vite.config.ts"),
    root: path.resolve(import.meta.dirname, ".."),
    server: { host: "0.0.0.0", port: 6174, strictPort: true },
  });
  await server.listen();
  server.printUrls();
}

/** Executes a CLI request. Importing it does not start a browser or server.
 * @throws For invalid arguments, failed approvals, or failed command startup.
 */
export async function main(args = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: OPTIONS });
  const [action] = positionals;
  if (values.help || !action) {
    process.stdout.write(HELP);
    return;
  }
  if (positionals.length !== 1) throw new Error("Unexpected positional argument.");
  if (action === "run" || action === "selftest") await runAction(action, values);
  else if (action === "approve") await approveAction(values);
  else if (action === "review") await reviewAction();
  else throw new Error(`Unknown command ${action}. Use --help.`);
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 3;
  });
}
