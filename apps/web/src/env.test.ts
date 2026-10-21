import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to the lab agent, no sign-in and the Demo on", () => {
    expect(parseEnv({}, "http://localhost:5173")).toEqual({
      agent: { kind: "lab" },
      auth: { kind: "none" },
      shareBase: "http://localhost:5173",
      demo: true,
    });
  });

  it("leaves the Demo out when VITE_DEMO is off, and refuses any other value", () => {
    expect(parseEnv({ VITE_DEMO: "off" }, "").demo).toBe(false);
    expect(() => parseEnv({ VITE_DEMO: "yes" }, "")).toThrow(/VITE_DEMO/);
  });

  it("keeps public threads on the gateway, whichever agent answers (ADR-131)", () => {
    expect(
      parseEnv({ VITE_GATEWAY_URL: "https://api.example" }, "https://kay.example").shareBase,
    ).toBe("https://api.example");
  });

  it("points a gateway with no URL at the site's own origin", () => {
    expect(parseEnv({ VITE_AGENT: "gateway" }, "https://kay.example").agent).toEqual({
      kind: "gateway",
      baseUrl: "https://kay.example",
    });
  });

  it("keeps a gateway URL when one is given", () => {
    const env = parseEnv(
      { VITE_AGENT: "gateway", VITE_GATEWAY_URL: "https://api.example" },
      "https://kay.example",
    );
    expect(env.agent).toEqual({ kind: "gateway", baseUrl: "https://api.example" });
  });

  it("refuses WorkOS without its client id and redirect URI", () => {
    expect(() => parseEnv({ VITE_AUTH: "workos" }, "")).toThrow(/VITE_WORKOS_CLIENT_ID/);
  });

  it("rejects an unknown agent kind", () => {
    expect(() => parseEnv({ VITE_AGENT: "cloud" }, "")).toThrow(/VITE_AGENT/);
  });
});
