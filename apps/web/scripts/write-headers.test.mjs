import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  headersFile,
  inlineScriptsIn,
  scriptHashes,
} from "./write-headers.mjs";

describe("inlineScriptsIn", () => {
  it("takes the contents of scripts without a src, attributes and all", () => {
    const html = [
      `<script>(()=>{localStorage.getItem("theme")})()</script>`,
      `<script type="module" async="">import "/assets/entry.js";</script>`,
      `<script src="/assets/external.js"></script>`,
    ].join("\n");
    expect(inlineScriptsIn(html)).toEqual([
      `(()=>{localStorage.getItem("theme")})()`,
      `import "/assets/entry.js";`,
    ]);
  });

  it("keeps a multiline script whole", () => {
    const html = `<script>window.a = 1;\nwindow.b = 2;</script>`;
    expect(inlineScriptsIn(html)).toEqual(["window.a = 1;\nwindow.b = 2;"]);
  });
});

describe("scriptHashes", () => {
  it("hashes a script as CSP names it, sha256 in base64", () => {
    expect(scriptHashes(["alert(1)"])).toEqual([
      "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='",
    ]);
  });

  it("sorts and deduplicates so the header is stable across builds", () => {
    const once = scriptHashes(["console.log(2)", "alert(1)", "alert(1)"]);
    expect(once).toEqual(scriptHashes(["alert(1)", "console.log(2)"]));
    expect(once).toHaveLength(2);
  });
});

describe("contentSecurityPolicy", () => {
  it("allows the site's own files and the hashed inline scripts, nothing else", () => {
    expect(contentSecurityPolicy(["'sha256-abc'"])).toBe(
      "default-src 'self'; " +
        "script-src 'self' 'wasm-unsafe-eval' 'sha256-abc'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self'; " +
        "connect-src 'self' https://api.workos.com; " +
        "worker-src 'self'; " +
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
  });
});

describe("headersFile", () => {
  it("applies the headers to every path, indented as Cloudflare reads them", () => {
    expect(headersFile("default-src 'self'")).toBe(
      "/*\n" +
        "  X-Content-Type-Options: nosniff\n" +
        "  Referrer-Policy: strict-origin-when-cross-origin\n" +
        "  Permissions-Policy: camera=(), geolocation=(), microphone=(self)\n" +
        "  Content-Security-Policy: default-src 'self'\n",
    );
  });
});
