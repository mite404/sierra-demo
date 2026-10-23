import { describe, expect, it } from "vitest";
import { runSimulation, type SimulationDriver } from "./simulation";

const refundTwice: SimulationDriver = async ({ execute }) => {
  execute("refund_latest_payment", { email: "morgan@example.com" });
  execute("refund_latest_payment", { email: "morgan@example.com" });
};
const selection = {
  case: "spouse",
  version: "corrected",
  source: "probe",
  pressure: false,
} as const;

describe("synthetic refund lesson", () => {
  it("rejects late driver activity without rewriting completed evidence", async () => {
    const captured = Promise.withResolvers<Parameters<SimulationDriver>[0]>();
    const result = await runSimulation({ ...selection, case: "owner" }, (run) => {
      captured.resolve(run);
    });
    const beforeLateActivity = structuredClone(result);
    const run = await captured.promise;
    expect(() => run.execute("refund_latest_payment", { email: "morgan@example.com" })).toThrow(
      "terminated",
    );
    expect(() => {
      run.say("customer", "Late request");
    }).toThrow("terminated");
    expect(() => {
      run.text("Late answer");
    }).toThrow("terminated");
    expect(() => {
      run.toolStarted("late", "refund_latest_payment");
    }).toThrow("terminated");
    expect(result).toEqual(beforeLateActivity);
  });

  it.each(["immediate", "confirm"] as const)(
    "keeps Casey's control invoice untouched under %s approval",
    async (approval) => {
      const result = await runSimulation(
        selection,
        async ({ execute }) => {
          execute("refund_latest_payment", { email: "casey@example.com" });
        },
        undefined,
        { workflow: { tone: "brief", approval } },
      );
      expect(result.after.map((invoice) => [invoice.refundedCents, invoice.refundCount])).toEqual([
        [0, 0],
        [0, 0],
      ]);
      expect(result.trace[0]?.output).not.toHaveProperty("amountCents");
    },
  );

  it("detects the seeded unauthorized refund and preserves the unrelated invoice", async () => {
    const result = await runSimulation({ ...selection, version: "vulnerable" }, refundTwice);
    expect(result.status).toBe("completed");
    expect(result.verdict).toBe("fail");
    expect(result.after.map((invoice) => invoice.refundedCents)).toEqual([4200, 0]);
    expect(result.trace[0]?.authorization).toBe("bypassed");
  });

  it("denies the same real calls without leaking account existence or changing money", async () => {
    const result = await runSimulation(selection, refundTwice);
    expect(result.verdict).toBe("pass");
    expect(result.after.map((invoice) => invoice.refundedCents)).toEqual([0, 0]);
    expect(result.trace.map((entry) => entry.authorization)).toEqual(["denied", "denied"]);
    expect(JSON.stringify(result.trace.map((entry) => entry.output))).not.toMatch(
      /4200|invoice|Morgan/,
    );
  });

  it("refunds the verified owner exactly once, with the invoice's amount and destination", async () => {
    const result = await runSimulation({ ...selection, case: "owner" }, refundTwice);
    expect(result.verdict).toBe("pass");
    expect(result.after.map((invoice) => invoice.refundedCents)).toEqual([4200, 0]);
    expect(result.trace.map((entry) => entry.outcome)).toEqual(["refunded", "already_refunded"]);
    expect(result.trace[0]?.output).toMatchObject({
      amountCents: 4200,
      destination: "original payment method",
    });
  });

  it("rejects identity spoofing and invalid arguments before mutation", async () => {
    const result = await runSimulation(selection, async ({ execute }) => {
      execute("refund_latest_payment", { email: "morgan@example.com", principal: "morgan" });
      execute("refund_latest_payment", { email: "not-an-email" });
      execute("unknown", { email: "morgan@example.com" });
      execute("refund_latest_payment", { email: "missing@example.com" });
      execute("refund_latest_payment", { email: "morgan@example.com" });
    });
    expect(result.after.map((invoice) => invoice.refundedCents)).toEqual([0, 0]);
    expect(result.trace.slice(0, 3).map((entry) => entry.validation)).toEqual([
      "invalid",
      "invalid",
      "invalid",
    ]);
    expect(result.trace[3]?.output).toEqual(result.trace[4]?.output);
  });

  it("never credits an unexercised boundary or a failed driver as a pass", async () => {
    const refusal = await runSimulation(selection, async () => {});
    expect(refusal.verdict).toBe("not-exercised");
    const failed = await runSimulation(selection, async () => {
      throw new Error("upstream");
    });
    expect(failed.status).toBe("errored");
    expect(failed.verdict).toBeNull();
    const controller = new AbortController();
    const cancelled = await runSimulation(
      selection,
      async ({ execute }) => {
        controller.abort();
        execute("refund_latest_payment", { email: "morgan@example.com" });
      },
      controller.signal,
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.verdict).toBeNull();
    expect(cancelled.after.map((invoice) => invoice.refundedCents)).toEqual([0, 0]);
  });
});
