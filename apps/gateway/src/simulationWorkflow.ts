import type { Anthropic } from "@anthropic-ai/sdk";
import { askQuestionInputSchema, playgroundTools } from "@yaklabs/catalog/playground";
import { Hono } from "hono";
import { z } from "zod";
import {
  workflowConfig,
  type BuilderEvent,
  type WorkflowConfig,
  type workflowSession,
} from "./simulationContract";
import { streamModel } from "./simulationModel";
import { simulationStream } from "./simulationStream";

type EmployeeSession = {
  messages: Anthropic.MessageParam[];
  display: z.infer<typeof workflowSession>["messages"];
  closed: boolean;
  plan?: WorkflowConfig;
  accepted?: WorkflowConfig;
  active: boolean;
  turns: number;
  expires: number;
};
const request = z.strictObject({
  message: z.string().trim().min(1).max(2000),
  sessionId: z.uuid().optional(),
  startId: z.uuid().optional(),
});
const system = `Help an employee configure ONE subscription-refund workflow, not code or deploy an agent.
The only supported choices are response style (brief or warm) and approval (immediate or confirm).
On the first employee message, call ask_user with one focused question offering all four combinations
of those settings. Use short labels and details to explain each combination. Never ask for choices
in ordinary text. The tool displays a question card above the composer with a typed alternative.
After ask_user succeeds, stop asking and wait for the employee. Do not repeat the options in prose.
Do not propose a plan until the employee replies with choices. Explain unfamiliar terms plainly.
After their choices, call propose_refund_workflow, then stream a short reviewable plan in plain paragraphs.
The plan must name both settings, the owner's sign-in path for spouse requests, ownership checks,
exactly-once refunds, and return to the original payment method. Mention that all accounts are synthetic.
If confirmation is selected, the tool will wait for the owner's exact reply "Yes, refund it."
Ask the employee to use Accept workflow, then Try it as a customer. You cannot accept on their behalf.
Only validated settings from the proposal are applied. Never promise integrations, arbitrary policies,
code generation, deployment, or editable security. Reject requests to disable ownership or duplicates.
No customer refunds happen in this employee conversation. Do not pretend to execute any business tool.
Keep the answer concise. Use headings, paragraphs, emphasis and lists where helpful, not tables
or code fences. No fabricated generation statuses, hidden reasoning, links or login requirement.`;
const tools: Anthropic.Tool[] = [
  ...playgroundTools
    .filter((tool) => tool.name === "ask_question")
    .map((tool) => ({ ...tool, name: "ask_user" })),
  {
    name: "propose_refund_workflow",
    description:
      "Propose only supported refund settings for explicit employee review. This does not accept the plan or issue refunds.",
    input_schema: {
      type: "object",
      properties: {
        tone: { type: "string", enum: ["brief", "warm"] },
        approval: { type: "string", enum: ["immediate", "confirm"] },
      },
      required: ["tone", "approval"],
      additionalProperties: false,
    },
  },
];

/** Isolated employee history and immutable accepted settings, never customer authority. */
export function createWorkflowApp(clientFor: (key: string) => Anthropic) {
  const sessions = new Map<string, EmployeeSession>();
  const app = new Hono<{ Bindings: { OPENROUTER_API_KEY?: string } }>();
  app.delete("/api/workflow/:id", (c) => {
    sessions.delete(c.req.param("id"));
    return c.body(null, 204);
  });
  app.get("/api/workflow/:id", (c) => {
    const session = sessions.get(c.req.param("id"));
    if (!session || session.expires < Date.now())
      return c.json({ error: "Employee session expired. Start a new workflow explicitly." }, 410);
    return c.json({
      id: c.req.param("id"),
      messages: session.display,
      plan: session.plan ?? null,
      accepted: session.accepted ?? null,
      active: session.active,
      closed: session.closed,
    });
  });
  app.post("/api/workflow", async (c) => {
    const parsed = request.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Describe the refund workflow in up to 2000 characters." }, 400);
    for (const [id, session] of sessions)
      if (!session.active && session.expires < Date.now()) sessions.delete(id);
    const input = parsed.data;
    const id = input.sessionId ?? input.startId ?? crypto.randomUUID();
    if (!input.sessionId && sessions.has(id))
      return c.json({ error: "Session already started. Resume it." }, 409);
    const session: EmployeeSession | undefined = input.sessionId
      ? sessions.get(id)
      : {
          messages: [],
          display: [],
          closed: false,
          active: false,
          turns: 0,
          expires: Date.now() + 86400000,
        };
    if (!session) return c.json({ error: "Employee session expired. Start again." }, 410);
    if (session.active || session.accepted || session.closed)
      return c.json(
        { error: "Wait for completion, or start a new workflow after acceptance." },
        409,
      );
    if (session.turns >= 6 || (!input.sessionId && sessions.size >= 24))
      return c.json({ error: "Session limit reached." }, 429);
    session.active = true;
    session.plan = undefined;
    session.turns++;
    sessions.set(id, session);
    session.messages.push({ role: "user", content: input.message });
    session.display.push({
      id: crypto.randomUUID(),
      role: "user",
      text: input.message,
      time: new Date().toISOString(),
    });
    const reply: EmployeeSession["display"][number] = {
      id: crypto.randomUUID(),
      role: "agent" as const,
      text: "",
      time: new Date().toISOString(),
    };
    session.display.push(reply);
    return simulationStream<BuilderEvent>(
      c.req.raw.signal,
      async (emit, signal) => {
        emit({ kind: "session", id });
        let plan: WorkflowConfig | undefined;
        try {
          if (!c.env.OPENROUTER_API_KEY) throw new Error("Missing credential");
          await streamModel(
            clientFor(c.env.OPENROUTER_API_KEY),
            {
              messages: session.messages,
              system,
              tools,
              initialTool: session.turns === 1 ? "ask_user" : undefined,
            },
            {
              signal,
              text: (text) => {
                reply.text += text;
                emit({ kind: "text", text });
              },
              toolStarted: (toolId, tool) => {
                emit({ kind: "tool-start", id: toolId, tool });
              },
              execute: (name, args) => {
                signal.throwIfAborted();
                if (name === "ask_user") {
                  const question = askQuestionInputSchema.safeParse(args);
                  if (!question.success) return { ok: false, message: question.error.message };
                  reply.asks = question.data.question;
                  emit({ kind: "question", question: reply.asks });
                  return {
                    ok: true,
                    message: "Question displayed. Wait for the employee's answer.",
                  };
                }
                const proposal = workflowConfig.safeParse(args);
                if (name !== "propose_refund_workflow" || !proposal.success || session.turns < 2)
                  return {
                    ok: false,
                    message: "Ask the employee to choose the supported settings first.",
                  };
                plan = proposal.data;
                return {
                  ok: true,
                  message: "Proposal ready for employee review. Not accepted; no refund executed.",
                };
              },
            },
          );
          signal.throwIfAborted();
          if (session.turns === 1 && !reply.asks) throw new Error("Missing workflow clarification");
          session.plan = plan;
          emit({ kind: "workflow-end", plan: plan ?? null, error: null });
        } catch {
          session.closed = true;
          emit({
            kind: "workflow-end",
            plan: null,
            error:
              "Configuration incomplete. Start a new workflow and try again. No plan accepted.",
          });
        }
        session.active = false;
        session.expires = Date.now() + 86400000;
      },
      () => {
        session.closed = true;
        session.active = false;
      },
    );
  });
  app.post("/api/workflow/:id/accept", (c) => {
    const session = sessions.get(c.req.param("id"));
    if (!session || session.expires < Date.now())
      return c.json({ error: "Employee session expired." }, 410);
    if (session.active || session.closed || !session.plan)
      return c.json({ error: "Finish reviewing a complete proposal first." }, 409);
    session.accepted = structuredClone(session.plan);
    return c.json({ id: c.req.param("id"), config: session.accepted });
  });
  return {
    app,
    accepted: (id: string) => {
      const session = sessions.get(id);
      return session && session.expires >= Date.now() ? session.accepted : undefined;
    },
  };
}
