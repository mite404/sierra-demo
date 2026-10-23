import { afterEach, expect, it, vi } from "vitest";
import { readLab, restoreLab, saveLab } from "./simulation-persistence";

afterEach(() => vi.unstubAllGlobals());

function recoveryFetch(authorId: string, author: unknown) {
  return (url: string, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    return Promise.resolve(
      url.endsWith(authorId) ? Response.json(author) : new Response(null, { status: 410 }),
    );
  };
}

function browserStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

it("keeps author recovery independent of expired employee and customer roles without resubmitting", async () => {
  const authorId = "00000000-0000-4000-8000-000000000087";
  const employeeId = "00000000-0000-4000-8000-000000000085";
  const customerId = "00000000-0000-4000-8000-000000000086";
  const author = {
    id: authorId,
    source: { workflowId: employeeId },
    workflow: { id: employeeId, config: { tone: "warm", approval: "confirm" } },
    messages: [{ id: "turn", role: "user", text: "Custom patient pressure", time: "now" }],
    draft: null,
    closed: false,
    active: true,
  };
  vi.stubGlobal("fetch", recoveryFetch(authorId, author));
  const restored = await restoreLab({
    authorId,
    employeeId,
    customerId,
    phase: "library",
    persona: "spouse",
  });
  expect(restored).toEqual({
    employee: null,
    customer: null,
    author,
    employeeUnavailable: true,
    customerUnavailable: true,
    authorUnavailable: false,
  });
});

it("persists only author handles and library navigation, not proposals or approval", () => {
  vi.stubGlobal("localStorage", browserStorage());
  saveLab({ phase: "library", authorId: "00000000-0000-4000-8000-000000000087" });
  expect(readLab()).toEqual({
    phase: "library",
    authorId: "00000000-0000-4000-8000-000000000087",
    persona: "spouse",
  });
  saveLab({ authorId: undefined });
  expect(readLab()).toEqual({ phase: "library", persona: "spouse" });
});
