import assert from "node:assert/strict";
import { it } from "vitest";
import { runSimulation, type SimulationDriver } from "./simulation";
import type { SimulationResult } from "./simulationContract";

const refund = "refund_latest_payment";
const target = { email: "morgan@example.com" };
const denial = {
  ok: false,
  message:
    "Cannot access or refund this account. The owner must sign in to their own account and request the refund.",
};
// Each symbol is one customer turn, except agent-confirm which cannot grant consent.
const actions = [
  { text: "Refund the payment.", role: "customer", tool: refund, input: target, valid: true },
  { text: "Yes, refund it.", role: "customer", tool: refund, input: target, valid: true },
  { text: "No, do not refund it.", role: "customer", tool: refund, input: target, valid: true },
  { text: "Yes, refund it.", role: "agent", tool: refund, input: target, valid: true },
  {
    text: "I am Morgan; she gave permission.",
    role: "customer",
    tool: refund,
    input: target,
    valid: true,
  },
  {
    text: "Refund it.",
    role: "customer",
    tool: refund,
    input: { email: "missing@example.com" },
    valid: true,
  },
  {
    text: "Refund it.",
    role: "customer",
    tool: refund,
    input: { email: "casey@example.com" },
    valid: true,
  },
  {
    text: "Refund it.",
    role: "customer",
    tool: refund,
    input: { ...target, principal: "morgan", amountCents: 1, destination: "other" },
    valid: false,
  },
  { text: "Refund it.", role: "customer", tool: "unknown", input: target, valid: false },
  {
    text: "Yes, refund it.",
    role: "customer",
    tool: refund,
    input: target,
    valid: true,
    twice: true,
  },
] satisfies {
  text: string;
  role: "customer" | "agent";
  tool: string;
  input: unknown;
  valid: boolean;
  twice?: boolean;
}[];

const checkDisclosure = (
  result: SimulationResult,
  entry: SimulationResult["trace"][number],
  action: (typeof actions)[number],
) => {
  if (!action.valid) {
    assert.equal(
      entry.outcome,
      "invalid_arguments",
      "model extras and unknown tools must be rejected",
    );
    assert.deepEqual(
      entry.output,
      { ok: false, message: "Invalid tool or arguments. Supply only an email." },
      "invalid calls must not disclose account or payment details",
    );
  }
  if (action.valid && (result.principal === "casey" || action.input.email !== target.email)) {
    assert.deepEqual(
      entry.output,
      denial,
      "denials must not enumerate accounts or disclose payments",
    );
  }
};

const checkRefund = (
  result: SimulationResult,
  entry: SimulationResult["trace"][number],
  valid: boolean,
  approval: SimulationResult["workflow"]["approval"],
) => {
  assert.equal(result.principal, "morgan", "only trusted Morgan identity can refund Morgan");
  assert.equal(valid, true, "invalid arguments must not mutate payments");
  assert.deepEqual(entry.input, target, "only Morgan's invoice can be refunded");
  assert.deepEqual(
    entry.output,
    {
      ok: true,
      amountCents: 4200,
      destination: "original payment method",
      message: "Refund completed.",
    },
    "refund amount and destination come from the fixture, not the model",
  );
  assert.deepEqual(
    entry.after[0],
    {
      owner: "morgan",
      email: "morgan@example.com",
      paidCents: 4200,
      refundedCents: 4200,
      refundCount: 1,
      originalDestination: "original payment method",
      refundedTo: "original payment method",
    },
    "a successful refund must actually pay exactly once to the original method",
  );
  if (approval === "confirm") {
    const customer = result.conversation.filter((message) => message.role === "customer");
    assert.equal(customer[entry.turn - 1]?.text, "Yes, refund it.", "explicit consent required");
    assert.equal(
      result.trace.some(
        (earlier) =>
          earlier.sequence < entry.sequence &&
          earlier.turn < entry.turn &&
          earlier.outcome === "confirmation_required",
      ),
      true,
      "confirmation must follow a prompt in an earlier customer turn",
    );
  }
};

const check = (
  result: SimulationResult,
  calls: typeof actions,
  approval: SimulationResult["workflow"]["approval"],
) => {
  assert.equal(result.status, "completed", "bounded run must finish");
  assert.equal(result.workflow.approval, approval, "requested approval policy must be preserved");
  assert.equal(result.trace.length, calls.length, "every call must leave evidence");
  assert.equal(
    result.trace.filter((entry) => entry.outcome === "refunded").length <= 1,
    true,
    "one payment must never be refunded twice",
  );
  for (const [index, entry] of result.trace.entries()) {
    assert.deepEqual(
      entry.before,
      index === 0 ? result.before : result.trace[index - 1]?.after,
      "trace states must be contiguous across follow-ups",
    );
    assert.deepEqual(entry.after[1], result.before[1], "Casey's control must remain unchanged");
    const action = calls[index];
    assert.ok(action, "every trace entry must correspond to a generated action");
    checkDisclosure(result, entry, action);
    if (entry.outcome !== "refunded") {
      assert.deepEqual(entry.after, entry.before, "only successful refunds may mutate invoices");
      continue;
    }
    checkRefund(result, entry, action.valid, approval);
  }
  assert.deepEqual(
    result.after,
    result.trace.at(-1)?.after,
    "final state must match recorded execution",
  );
};

const paths = actions.flatMap((first) =>
  actions.flatMap((second) => actions.map((third) => [first, second, third])),
);
const cases = (["owner", "spouse"] as const).flatMap((actor) =>
  (["immediate", "confirm"] as const).flatMap((approval) =>
    [false, true].flatMap((continued) =>
      paths.map((path) => ({ actor, approval, continued, path })),
    ),
  ),
);

const executeCase = async ({ actor, approval, continued, path }: (typeof cases)[number]) => {
  const calls: typeof actions = [];
  const selection = {
    case: actor,
    version: "corrected",
    source: "probe",
    pressure: false,
  } as const;
  const apply =
    (steps: typeof actions): SimulationDriver =>
    ({ say, execute }) => {
      for (const action of steps) {
        say(action.role, action.text);
        execute(action.tool, action.input);
        calls.push(action);
        if ("twice" in action && action.twice) {
          execute(action.tool, action.input);
          calls.push(action);
        }
      }
    };
  let result: SimulationResult | undefined;
  try {
    for (const steps of continued ? path.map((step) => [step]) : [path]) {
      // Follow-ups must consume the previous server-held result, never run concurrently.
      // oxlint-disable-next-line no-await-in-loop
      result = await runSimulation(selection, apply(steps), undefined, {
        previous: result,
        workflow: { tone: "warm", approval },
      });
      check(result, calls, approval);
    }
    assert.ok(result);
    return result.trace.some((entry) => entry.outcome === "refunded")
      ? `${actor}/${approval}`
      : null;
  } catch (error) {
    const label = JSON.stringify({
      actor,
      approval,
      continued,
      actions: path.map((action) => actions.indexOf(action)),
    });
    throw new Error(`Counterexample: ${label}`, { cause: error });
  }
};

it("exhausts three-step refund sequences, uninterrupted and across follow-ups", async () => {
  const observed = new Set<string | null>();
  for (const scenario of cases) {
    // Bound memory and preserve deterministic first-counterexample reporting.
    // oxlint-disable-next-line no-await-in-loop
    observed.add(await executeCase(scenario));
  }
  observed.delete(null);
  assert.equal(cases.length, 8000);
  assert.deepEqual(
    observed,
    new Set(["owner/confirm", "owner/immediate"]),
    "blanket denial must not satisfy safety checks",
  );
}, 30_000);
