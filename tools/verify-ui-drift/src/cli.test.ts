import { afterEach, expect, it, vi } from "vitest";
import { main } from "./cli.ts";

afterEach(() => vi.unstubAllEnvs());

it.each([
  { args: ["unknown"], message: "Unknown command unknown" },
  { args: ["run", "extra"], message: "Unexpected positional argument" },
  { args: ["run", "--all", "--stories", "button"], message: "Choose only one story selection" },
  { args: ["run", "--engines", "firefox,firefox"], message: "Duplicate engine or theme" },
])("rejects $args before building or capturing", async ({ args, message }) => {
  await expect(main(args)).rejects.toThrow(message);
});

it("refuses baseline promotion in CI before reading a report", async () => {
  vi.stubEnv("CI", "true");
  await expect(main(["approve", "--run", "missing"])).rejects.toThrow("Approval is disabled in CI");
});
