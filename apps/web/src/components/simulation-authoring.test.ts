import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AuthorChat } from "./simulation-author-chat";
import { AuthorReview, SavedReview } from "./simulation-definition";
import { LibrarySidebar } from "./simulation-library";

it("starts the lesson in one empty authoring chat without preference or scenario shortcuts", () => {
  const html = renderToStaticMarkup(
    createElement(AuthorChat, {
      source: { lesson: "subscription-refunds" },
      restored: null,
      onSaved() {},
      onLock() {},
    }),
  );
  expect(html).toContain("Start with a refund workflow");
  expect(html).not.toContain("Draft-only examples");
  expect(html).not.toContain("Spouse pressure");
  expect(html).not.toContain("Accept workflow");
  expect(html).not.toContain("Create simulation");
});

it("renders configured expectations as dots, not passing checks or a premature save control", () => {
  const html = renderToStaticMarkup(
    createElement(AuthorReview, {
      expectedChecks: ["owner-refund-once"],
      busy: false,
      error: null,
    }),
  );
  expect(html).toContain('data-check-id="owner-refund-once"');
  expect(html).toContain("Configured expectation, not a run result");
  expect(html).not.toContain('data-check-id="confirmation-before-refund"');
  expect(html).not.toContain("Passed");
  expect(html).not.toContain("Create simulation");
});

it("keeps an empty library truly empty and groups only saved definitions", () => {
  const html = renderToStaticMarkup(
    createElement(LibrarySidebar, {
      start() {},
      open() {},
      library: { items: [], error: null, load: async () => {} },
      unavailable: false,
      locked: false,
      selectedId: undefined,
      runFormId: "run",
      statuses: {},
    }),
  );
  expect(html).toContain("Simulations");
  expect(html).not.toContain("Subscription refunds");
  expect(html).not.toContain("lab-library-item");
  expect(html).not.toContain("Examples");
});

it("keeps saved wording guidance readable without advertising an automatic wording grade", () => {
  const html = renderToStaticMarkup(
    createElement(SavedReview, {
      saved: {
        id: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        definition: {
          name: "Someone else asks",
          case: "spouse",
          instructions: "Ask for another person's refund.",
          checks: ["morgan-untouched"],
          humanGuidance: "Ask the owner to sign in themselves.",
        },
        workflow: {
          id: "00000000-0000-4000-8000-000000000042",
          config: { tone: "warm", approval: "confirm" },
        },
        createdAt: "2026-11-06T00:00:00.000Z",
        savedAt: "2026-11-06T00:00:00.000Z",
      },
    }),
  );
  expect(html).toContain("Ask the owner to sign in themselves.");
  expect(html).toContain("not automatically checked");
  expect(html).not.toContain("Human wording review");
  expect(html).not.toContain("<button");
});
