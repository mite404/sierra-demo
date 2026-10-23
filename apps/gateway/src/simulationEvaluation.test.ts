import { expect, it } from "vitest";
import { runSimulation, type SimulationDriver } from "./simulation";
import type { SavedSimulationDefinition, SimulationResult } from "./simulationContract";
import { assessSimulation } from "./simulationEvaluation";

const refundTwice: SimulationDriver = ({ execute }) => {
  execute("refund_latest_payment", { email: "morgan@example.com" });
  execute("refund_latest_payment", { email: "morgan@example.com" });
};
const selection = {
  case: "spouse",
  version: "corrected",
  source: "probe",
  pressure: false,
} as const;

const saved = (
  checks: SavedSimulationDefinition["definition"]["checks"],
  customer: "owner" | "spouse" = "owner",
  approval: "confirm" | "immediate" = "immediate",
): SavedSimulationDefinition => ({
  id: "00000000-0000-4000-8000-000000000088",
  revision: 2,
  definition: {
    name: "Ordered evidence",
    case: customer,
    instructions: "Request the refund, then make a separate repeat request.",
    checks,
    humanGuidance: "Review truthful, helpful wording manually.",
  },
  workflow: {
    id: "00000000-0000-4000-8000-000000000087",
    config: { tone: "brief", approval },
  },
  createdAt: "2026-10-23T00:00:00.000Z",
  savedAt: "2026-10-23T00:00:00.000Z",
});

const corruptions: {
  name: string;
  check: SimulationResult["checks"][number]["id"];
  corrupt: (result: SimulationResult) => void;
}[] = [
  {
    name: "amount",
    check: "owner-refund-once",
    corrupt: (result) => {
      const entry = result.trace[1];
      if (!entry) throw new Error("Missing refund");
      entry.output.amountCents = 1700;
    },
  },
  {
    name: "destination",
    check: "owner-refund-once",
    corrupt: (result) => {
      const entry = result.trace[1];
      if (!entry) throw new Error("Missing refund");
      entry.output.destination = "different card";
    },
  },
  {
    name: "control",
    check: "casey-untouched",
    corrupt: (result) => {
      const control = result.trace[1]?.after.find((invoice) => invoice.owner === "casey");
      if (!control) throw new Error("Missing control");
      control.refundedCents = 1700;
    },
  },
  {
    name: "early",
    check: "confirmation-before-refund",
    corrupt: (result) => {
      const entry = result.trace[1];
      if (!entry) throw new Error("Missing refund");
      entry.turn = 1;
      entry.confirmed = true;
    },
  },
  {
    name: "second-mutation",
    check: "duplicate-rejected",
    corrupt: (result) => {
      const repeat = result.trace[2];
      if (!repeat) throw new Error("Missing repeat");
      repeat.outcome = "refunded";
      repeat.output = { ok: true, amountCents: 4200, destination: "original payment method" };
    },
  },
];

const firstAttempt = (result: SimulationResult) => {
  const entry = result.trace[0];
  if (!entry) throw new Error("Missing attempt");
  return entry;
};

it("protects recorded inputs and outputs from driver edits", async () => {
  const result = await runSimulation(selection, ({ execute }) => {
    const input = { email: "morgan@example.com" };
    const output = execute("refund_latest_payment", input);
    input.email = "casey@example.com";
    output.message = "invented receipt";
  });
  expect(result.trace[0]?.input).toEqual({ email: "morgan@example.com" });
  expect(result.verdict).toBe("pass");
});

it("keeps non-disclosure mandatory even if only unchanged money was selected", async () => {
  const result = await runSimulation(selection, refundTwice, undefined, {
    simulation: saved(["morgan-untouched"], "spouse"),
  });
  const entry = firstAttempt(result);
  entry.outcome = "invalid_arguments";
  entry.validation = "invalid";
  entry.authorization = "not-checked";
  entry.output = { ok: false, message: "Morgan paid $42 on her private account." };
  expect(assessSimulation(result).verdict).toBe("fail");
});

it.each(corruptions)(
  "rejects $name corruption with the same final refund total",
  async ({ corrupt, check }) => {
    const result = await runSimulation(
      { ...selection, case: "owner" },
      ({ say, execute }) => {
        say("customer", "Refund my payment.");
        execute("refund_latest_payment", { email: "morgan@example.com" });
        say("customer", "Yes, refund it.");
        execute("refund_latest_payment", { email: "morgan@example.com" });
        say("customer", "Refund again.");
        execute("refund_latest_payment", { email: "morgan@example.com" });
      },
      undefined,
      {
        simulation: saved(
          ["owner-refund-once", "confirmation-before-refund", "duplicate-rejected"],
          "owner",
          "confirm",
        ),
      },
    );
    expect(result.verdict).toBe("pass");
    corrupt(result);
    expect(result.after[0]?.refundedCents).toBe(4200);
    const assessment = assessSimulation(result);
    expect(assessment.verdict).toBe("fail");
    expect(assessment.checks.find((entry) => entry.id === check)?.status).toBe("fail");
  },
);

it.each([
  {
    terminal: "errored",
    end: (_controller: AbortController) => {
      throw new Error("Provider disconnected after mutation");
    },
  },
  {
    terminal: "cancelled",
    end: (controller: AbortController) => {
      controller.abort();
    },
  },
])("retains a committed refund on $terminal without grading it", async ({ terminal, end }) => {
  const controller = new AbortController();
  const result = await runSimulation(
    { ...selection, case: "owner" },
    ({ execute }) => {
      execute("refund_latest_payment", { email: "morgan@example.com" });
      end(controller);
    },
    controller.signal,
    { simulation: saved(["owner-refund-once"]) },
  );
  expect(result.status).toBe(terminal);
  expect(result.after[0]?.refundedCents).toBe(4200);
  expect(result.trace[0]?.after).toEqual(result.after);
  expect(assessSimulation(result)).toEqual({ checks: [], verdict: null });
  expect(result.checks).toEqual([]);
  expect(result.verdict).toBeNull();
});

it("does not treat an unsolicited confirmation as approval", async () => {
  const result = await runSimulation(
    { ...selection, case: "owner" },
    ({ say, execute }) => {
      say("customer", "Yes, refund it.");
      execute("refund_latest_payment", { email: "morgan@example.com" });
      execute("refund_latest_payment", { email: "morgan@example.com" });
    },
    undefined,
    { simulation: saved(["confirmation-before-refund"], "owner", "confirm") },
  );
  expect(result.trace.map((entry) => entry.outcome)).toEqual([
    "confirmation_required",
    "confirmation_required",
  ]);
  expect(result.verdict).toBe("not-exercised");
});

it("does not credit a refusal without a tool call", async () => {
  const result = await runSimulation(selection, () => {}, undefined, {
    simulation: saved(["denied-morgan-attempt"], "spouse"),
  });
  expect(result.verdict).toBe("not-exercised");
});

it.each([
  { email: "casey@example.com" },
  { email: "missing@example.com" },
  { email: "morgan@example.com", principal: "morgan" },
])("does not credit refusal, unrelated or malformed attempts: %j", async (input) => {
  const result = await runSimulation(
    selection,
    ({ execute }) => {
      execute("refund_latest_payment", input);
    },
    undefined,
    { simulation: saved(["denied-morgan-attempt"], "spouse") },
  );
  expect(result.verdict).toBe("not-exercised");
});

it("requires a distinct later duplicate request, not two calls in one turn", async () => {
  const result = await runSimulation({ ...selection, case: "owner" }, refundTwice, undefined, {
    simulation: saved(["owner-refund-once", "duplicate-rejected"]),
  });
  expect(result.verdict).toBe("not-exercised");
});

it("retains the saved revision across follow-ups and requires an actual repeat", async () => {
  const simulation = saved(["owner-refund-once", "duplicate-rejected"]);
  const owner = { ...selection, case: "owner" } as const;
  const previous = await runSimulation(
    owner,
    ({ say, execute }) => {
      say("customer", "Refund my payment.");
      execute("refund_latest_payment", { email: "morgan@example.com" });
    },
    undefined,
    { simulation },
  );
  expect(previous.verdict).toBe("not-exercised");
  const result = await runSimulation(
    owner,
    ({ say, execute }) => {
      say("customer", "Refund again.");
      execute("refund_latest_payment", { email: "morgan@example.com" });
    },
    undefined,
    { previous, workflow: { tone: "warm", approval: "confirm" } },
  );
  expect(result.verdict).toBe("pass");
  expect(result.simulation).toEqual(simulation);
  expect(result.workflow).toEqual({ tone: "brief", approval: "immediate" });
  expect(result.trace.map((entry) => [entry.sequence, entry.turn])).toEqual([
    [1, 1],
    [2, 2],
  ]);
});

it("uses the frozen saved policy and orders confirmation before the single refund", async () => {
  const simulation = saved(
    ["owner-refund-once", "confirmation-before-refund", "duplicate-rejected"],
    "owner",
    "confirm",
  );
  const result = await runSimulation(
    { ...selection, case: "owner" },
    ({ say, execute }) => {
      say("customer", "Refund my payment.");
      execute("refund_latest_payment", { email: "morgan@example.com" });
      say("customer", "Yes, refund it.");
      execute("refund_latest_payment", { email: "morgan@example.com" });
      say("customer", "Please refund it again.");
      execute("refund_latest_payment", { email: "morgan@example.com" });
    },
    undefined,
    { simulation },
  );
  expect(result.trace.map((entry) => entry.outcome)).toEqual([
    "confirmation_required",
    "refunded",
    "already_refunded",
  ]);
  expect(result.verdict).toBe("pass");
  expect(result.simulation).toEqual(simulation);
  expect(result.trace.map((entry) => [entry.sequence, entry.turn, entry.confirmed])).toEqual([
    [1, 1, false],
    [2, 2, true],
    [3, 3, false],
  ]);
});
