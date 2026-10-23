import { z } from "zod";

/** Only named fixtures cross HTTP; neither principal nor tool policy is client supplied. */
export const simulationSelection = z.strictObject({
  case: z.enum(["spouse", "owner"]),
  version: z.enum(["corrected", "vulnerable"]),
  source: z.enum(["live", "probe"]),
  pressure: z.boolean(),
});

export type SimulationSelection = z.infer<typeof simulationSelection>;

/** The only employee-editable settings; permission and duplicate safeguards are not options. */
export const workflowConfig = z.strictObject({
  tone: z.enum(["brief", "warm"]),
  approval: z.enum(["immediate", "confirm"]),
});
export type WorkflowConfig = z.infer<typeof workflowConfig>;

/** Receipt from the employee's explicit acceptance, never from a model assertion. */
export const acceptedWorkflow = z.object({ id: z.uuid(), config: workflowConfig });
export type AcceptedWorkflow = z.infer<typeof acceptedWorkflow>;

/** Chat can supply words, never identity, policy, history, or invoice state. */
export const simulationRequest = z.union([
  simulationSelection.extend({
    message: z.string().trim().min(1).max(2000).optional(),
    workflowId: z.uuid().optional(),
    startId: z.uuid().optional(),
  }),
  z.strictObject({ sessionId: z.uuid(), message: z.string().trim().min(1).max(2000) }),
]);

const invoice = z.object({
  owner: z.enum(["morgan", "casey"]),
  email: z.string(),
  paidCents: z.number(),
  refundedCents: z.number(),
  refundCount: z.number(),
});
const trace = z.object({
  tool: z.string(),
  input: z.unknown(),
  validation: z.enum(["valid", "invalid"]),
  authorization: z.enum(["allowed", "denied", "bypassed", "not-checked"]),
  outcome: z.string(),
  output: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
const check = z.object({ label: z.string(), status: z.enum(["pass", "fail", "not-exercised"]) });

/** Instructor evidence, separate from the tool output the simulated customer can see. */
export const simulationResult = z.object({
  selection: simulationSelection,
  workflow: workflowConfig,
  principal: z.enum(["casey", "morgan"]),
  status: z.enum(["running", "completed", "errored", "cancelled"]),
  verdict: z.enum(["pass", "fail", "not-exercised"]).nullable(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  elapsedMs: z.number(),
  conversation: z.array(z.object({ role: z.enum(["customer", "agent"]), text: z.string() })),
  trace: z.array(trace),
  before: z.array(invoice),
  after: z.array(invoice),
  checks: z.array(check),
});

export type SimulationResult = z.infer<typeof simulationResult>;
export type Invoice = z.infer<typeof invoice>;
export type ToolTrace = z.infer<typeof trace>;

/** Only upstream text and factual execution events cross the streaming boundary. */
export const simulationEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("session"), id: z.uuid() }),
  z.object({ kind: z.literal("snapshot"), result: simulationResult }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("tool-start"), id: z.string(), tool: z.string() }),
  z.object({ kind: z.literal("end"), result: simulationResult }),
  z.object({
    kind: z.literal("workflow-end"),
    plan: workflowConfig.nullable(),
    error: z.string().nullable(),
  }),
]);
export type SimulationEvent = z.infer<typeof simulationEvent>;

/** Display history from the server, never accepted back as model history or business state. */
export const sessionMessages = z.array(
  z.object({
    id: z.string(),
    role: z.enum(["user", "agent"]),
    text: z.string(),
    time: z.string(),
  }),
);

/** Authoritative employee session readback; an active/interrupted reply is not a finished plan. */
export const workflowSession = z.object({
  id: z.uuid(),
  messages: sessionMessages,
  plan: workflowConfig.nullable(),
  accepted: workflowConfig.nullable(),
  closed: z.boolean(),
  active: z.boolean(),
});

/** Authoritative customer readback retains the exact invoices and evidence behind this history. */
export const customerSession = z.object({
  id: z.uuid(),
  workflow: acceptedWorkflow,
  messages: sessionMessages,
  result: simulationResult.nullable(),
  closed: z.boolean(),
  active: z.boolean(),
});
