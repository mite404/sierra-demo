/// <reference types="vite/client" />
import { expect, it } from "vitest";

// Every module path under src, listed by Vite without importing any of them.
const modules = Object.keys(import.meta.glob("./**/*.{ts,tsx,js,jsx}"));

// "./Recap.tsx" and "./recap.ts" both answer the import "./Recap".
function importKey(path: string): string {
  return path.replace(/\.(ts|tsx|js|jsx)$/, "").toLowerCase();
}

it("has no module paths that differ only by letter case", () => {
  // Case-insensitive file systems (macOS default) resolve an extensionless import
  // to whichever variant matches first, so "./Recap" can load "recap.ts".
  const byKey = new Map<string, string[]>();
  for (const path of modules)
    byKey.set(importKey(path), [...(byKey.get(importKey(path)) ?? []), path]);
  const collisions = [...byKey.values()].filter((paths) => paths.length > 1);
  expect(collisions).toEqual([]);
});
