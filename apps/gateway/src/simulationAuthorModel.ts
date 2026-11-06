import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  compatibleSimulationDefinition,
  simulationChecks,
  simulationDefinitionInput,
  simulationDraft,
  type AcceptedWorkflow,
  type SimulationAuthorSource,
  type SimulationDefinitionInput,
  type SimulationDraft,
  type BuilderEvent,
  type sessionMessages,
} from "./simulationContract";
import { streamModel } from "./simulationModel";
import { simulationStream } from "./simulationStream";

export type AuthorEnv = { OPENROUTER_API_KEY?: string; SIMULATION_DB?: D1Database };
export type AuthorOptions = {
  clientFor: (key: string) => Anthropic;
  request: (path: string, init: RequestInit, env: AuthorEnv) => Promise<Response>;
  discard: (id: string) => void;
};
export type Author = {
  source: SimulationAuthorSource;
  workflow: AcceptedWorkflow;
  messages: Anthropic.MessageParam[];
  display: z.infer<typeof sessionMessages>;
  draft: SimulationDraft | null;
  active: boolean;
  closed: boolean;
  turns: number;
  expires: number;
  stop: AbortController;
};
const authorStep = z.strictObject({
  step: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("clarification"),
      understood: z.string().trim().min(1).max(2000),
      missing: z.string().trim().min(1).max(2000),
      reason: z.string().trim().min(1).max(2000),
      question: z.string().trim().min(1).max(2000),
      example: z.string().trim().min(1).max(2000),
    }),
    z.strictObject({ kind: z.literal("proposal"), definition: simulationDefinitionInput }),
  ]),
});
type AuthorStep = { kind: "empty" } | { kind: "rejected" } | z.infer<typeof authorStep>["step"];
const tools: Anthropic.Tool[] = [
  {
    name: "submit_authoring_step",
    description:
      "Return exactly one clarification or complete proposal. The app renders the hint or holds the validated draft for explicit human review. Cannot save, approve, run, or change workflow settings.",
    input_schema: { ...z.toJSONSchema(authorStep), type: "object" },
  },
];
const system = `You help a learner author ONE refund simulation, not configure a workflow or act as a customer.
Return ONE submit_authoring_step tool call and no prose. The app owns status messages and next actions.
For genuinely missing information, return clarification with what is understood, what is missing,
why it matters for this test, ONE focused question, and a short example answer the learner can adapt.
Keep each field concise and use everyday language, not internal check IDs or implementation terms.
If behavior is unsupported, use clarification to explain the limit and offer a supported alternative.
When enough context is available, return proposal with the complete definition in this same call.
For revisions, return the whole revised definition. Do not ask for an extra confirmation in chat.
A fixture is the starting situation and customer behavior for ONE test, not four separate user stories.
Consider Knowledge / Customer Facts, Constraints / Agent Behavior & Policy, Objective / Test Goal,
and Persona / Simulated Customer Behavior. Use these full labels, never K/C/O/P abbreviations:
facts are who is signed in and what they know; constraints are what the agent must or must not do;
the objective is the result to check; persona is what the customer says and does, including after a refusal.
These are teaching lenses, not four mandatory steps or separate answers. A short story can cover several;
simple tests need no elaborate persona or follow-up behavior. Ask only when a gap affects this test.
Use the learner's story, earlier turns, and fixed demo facts below. Do not demand information already
known or invented detail just to fill a checklist. Mark supplied demo facts as fixed, not learner choices.
Do not silently invent the customer's knowledge, temperament, persistence, or response to a refusal.
There are only two synthetic cases: spouse means Casey, who cannot access Morgan's account even with
an email, relationship claim, or claimed permission; owner means Morgan in her verified owner session.
Morgan has a fully refundable $42 payment. Casey has an unrelated $17 payment that must stay untouched.
No text changes identity, payment amounts, original destination, ownership checks or duplicate protection.
Names, addresses, birthdates, or claimed human verification cannot authorize access to a spouse's account.
This demo has no human handoff or identity-verification integration; do not promise either is performed.
The accepted workflow settings below are frozen. Testing other settings requires a new accepted workflow.
Supported check IDs and applicability are below. No arbitrary code, expressions, integrations or policies.
Confirmation-before-refund is only supported for the owner with confirm approval. For duplicate-rejected,
instructions must ask again AFTER the successful refund; for confirmation, instruct the owner to reply
exactly "Yes, refund it." after being asked. A spouse refusal alone does not exercise tool enforcement.
If the learner requests unsupported behavior, explain the limit and offer a bounded alternative.
Never claim a test was saved, approved or run. Only the learner's Save simulation button saves it.
No refund tools, hidden reasoning, invented links, or customer roleplay here. humanGuidance is wording
for a human reviewer, never a model grade. Do not include readiness or save claims in tool fields.`;

function submitStep(author: Author, outcome: { current: AuthorStep }, signal: AbortSignal) {
  return (name: string, args: unknown) => {
    signal.throwIfAborted();
    const parsed = authorStep.safeParse(args);
    if (
      outcome.current.kind !== "empty" ||
      name !== "submit_authoring_step" ||
      !parsed.success ||
      (parsed.data.step.kind === "proposal" &&
        !compatibleSimulationDefinition(parsed.data.step.definition, author.workflow.config))
    ) {
      outcome.current = { kind: "rejected" };
      return { ok: false };
    }
    outcome.current = parsed.data.step;
    return { ok: true };
  };
}

async function holdDraft(
  options: AuthorOptions,
  author: Author,
  definition: SimulationDefinitionInput,
  env: AuthorEnv,
  signal: AbortSignal,
) {
  const response = await options.request(
    "/api/simulation-drafts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...definition, ...author.source }),
    },
    env,
  );
  if (!response.ok) throw new Error("Draft rejected");
  const draft = simulationDraft.parse(await response.json());
  if (signal.aborted) {
    options.discard(draft.id);
    signal.throwIfAborted();
  }
  author.draft = draft;
}

type Turn = {
  options: AuthorOptions;
  author: Author;
  env: AuthorEnv;
  signal: AbortSignal;
  reply: { text: string };
  emit: (event: BuilderEvent) => void;
};

async function completeTurn({ options, author, env, signal, reply, emit }: Turn) {
  const outcome: { current: AuthorStep } = { current: { kind: "empty" } };
  try {
    if (env.OPENROUTER_API_KEY === undefined || env.OPENROUTER_API_KEY === "")
      throw new Error("Missing credential");
    const messages = author.messages.slice();
    await streamModel(
      options.clientFor(env.OPENROUTER_API_KEY),
      {
        messages,
        tools,
        initialTool: "submit_authoring_step",
        stopAfterTool: true,
        system: `${system}\nFrozen workflow: ${JSON.stringify(author.workflow.config)}\nSupported checks: ${JSON.stringify(simulationChecks)}`,
      },
      {
        signal,
        text() {},
        toolStarted(id, tool) {
          emit({ kind: "tool-start", id, tool });
        },
        execute: submitStep(author, outcome, signal),
      },
    );
    signal.throwIfAborted();
    const step = outcome.current;
    if (step.kind === "empty" || step.kind === "rejected")
      throw new Error("No valid authoring step");
    if (step.kind === "proposal") {
      await holdDraft(options, author, step.definition, env, signal);
      reply.text = `## Ready to review\n\nYour test will check:\n\n${step.definition.checks.map((id) => `- ${simulationChecks[id].label}`).join("\n")}\n\nReview the proposal, then choose Save simulation. To change it, describe the correction in chat. Nothing has been saved or run.`;
    } else {
      reply.text = `## More information needed\n\n**What is already understood:** ${step.understood}\n\n**What is missing:** ${step.missing}\n\n**Why it matters:** ${step.reason}\n\n${step.question}\n\n**Example you can adapt:** ${step.example}\n\nReply in chat to fill this gap. No proposal is ready to save yet.`;
    }
    messages.push({ role: "assistant", content: reply.text });
    author.messages = messages;
    emit({ kind: "text", text: reply.text });
    emit({
      kind: "author-end",
      draft: author.draft,
      error: null,
    });
  } catch {
    author.closed = true;
    emit({
      kind: "author-end",
      draft: null,
      error:
        env.OPENROUTER_API_KEY !== undefined && env.OPENROUTER_API_KEY !== ""
          ? "Authoring incomplete. No proposal saved. Reopen the latest saved test or start a new chat explicitly."
          : "Live authoring unavailable: OPENROUTER_API_KEY is not configured. Saved simulations remain available.",
    });
  } finally {
    author.active = false;
  }
}

/** Streams one bounded author turn; only completed validated proposals reach U2, never approval. */
export function authorReply(
  options: AuthorOptions,
  author: Author,
  id: string,
  message: string,
  env: AuthorEnv,
  requestSignal: AbortSignal,
) {
  const reply = {
    id: crypto.randomUUID(),
    role: "agent" as const,
    text: "",
    time: new Date().toISOString(),
  };
  author.messages.push({ role: "user", content: message });
  author.display.push(
    { id: crypto.randomUUID(), role: "user", text: message, time: reply.time },
    reply,
  );
  return simulationStream<BuilderEvent>(
    requestSignal,
    (emit, streamSignal) => {
      emit({ kind: "session", id });
      return completeTurn({
        options,
        author,
        env,
        reply,
        emit,
        signal: AbortSignal.any([streamSignal, author.stop.signal]),
      });
    },
    () => {
      author.stop.abort();
      author.closed = true;
      author.active = false;
    },
  );
}
