import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("validates objects without even probing dynamic compilation", () => {
  const module = new URL("../src/zod.ts", import.meta.url).href;
  const code = `
    let probes = 0;
    globalThis.Function = new Proxy(Function, {
      construct() { probes++; throw new EvalError("CSP refuses eval"); }
    });
    const { z } = await import(${JSON.stringify(module)});
    const schema = z.object({ amount: z.number().positive(), name: z.string() });
    const good = schema.safeParse({ amount: 7, name: "Invoice" });
    const bad = schema.safeParse({ amount: -2, name: 42 });
    process.stdout.write(JSON.stringify({ probes, good: good.data, bad: bad.success }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    probes: 0,
    good: { amount: 7, name: "Invoice" },
    bad: false,
  });
});
