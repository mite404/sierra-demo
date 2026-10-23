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
  type SimulationEvent,
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
type Proposal =
  | { kind: "empty" }
  | { kind: "rejected" }
  | { kind: "valid"; definition: SimulationDefinitionInput };
const tools: Anthropic.Tool[] = [
  {
    name: "propose_simulation",
    description:
      "Propose a complete bounded refund test for human review. Cannot save, approve, run, or change workflow settings.",
    input_schema: { ...z.toJSONSchema(simulationDefinitionInput), type: "object" },
  },
];
const system = `You help a learner author ONE refund simulation, not configure a workflow or act as a customer.
Use ordinary conversation. Ask one focused question for genuinely missing customer behavior, context,
or expected outcome. Customer instructions describe what the simulated customer knows and how they
should behave across turns, not just their first message. Keep custom details the learner supplies.
Once those details are clear, call propose_simulation with all fields and explain the review briefly.
For revisions, call propose_simulation again with the whole revised definition, not a patch.
The review summary is READ-ONLY. Only a validated propose_simulation call populates it and enables
Save simulation. Narrating a definition does not populate it. Never ask the learner to copy/paste
text into a review field or say Save is available before you have submitted a valid proposal.
There are only two synthetic cases: spouse means Casey, who cannot access Morgan's account even with
an email, relationship claim, or claimed permission; owner means Morgan in her verified owner session.
Morgan has a fully refundable $42 payment. Casey has an unrelated $17 payment that must stay untouched.
No text changes identity, payment amounts, original destination, ownership checks or duplicate protection.
The accepted workflow settings below are frozen. Testing other settings requires a new accepted workflow.
Supported check IDs and applicability are below. No arbitrary code, expressions, integrations or policies.
Confirmation-before-refund is only supported for the owner with confirm approval. For duplicate-rejected,
instructions must ask again AFTER the successful refund; for confirmation, instruct the owner to reply
exactly "Yes, refund it." after being asked. A spouse refusal alone does not exercise tool enforcement.
If the learner requests unsupported behavior, explain the limit and offer a bounded alternative.
Never claim a test was saved, approved or run. Only the learner's Save simulation button saves it.
No refund tools, hidden reasoning, invented links, or customer roleplay here. humanGuidance is wording
for a human reviewer, never a model grade. Write concise plain paragraphs, no Markdown tables or fences.`;

function proposalTool(author: Author, proposed: { current: Proposal }, signal: AbortSignal) {
  return (name: string, args: unknown) => {
    signal.throwIfAborted();
    const parsed = simulationDefinitionInput.safeParse(args);
    if (
      name !== "propose_simulation" ||
      !parsed.success ||
      !compatibleSimulationDefinition(parsed.data, author.workflow.config)
    ) {
      proposed.current = { kind: "rejected" };
      return {
        ok: false,
        message:
          "Only complete supported definitions are allowed. No approval, identity, workflow or safety overrides. Ask a focused question or correct the proposal.",
      };
    }
    proposed.current = { kind: "valid", definition: parsed.data };
    return {
      ok: true,
      message:
        "Validated proposal only. Not saved or approved. Ask the learner to review and explicitly Save simulation.",
    };
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
  emit: (event: SimulationEvent) => void;
};

async function proposeTurn(
  { options, author, env, signal, reply, emit }: Turn,
  proposed: { current: Proposal },
) {
  if (env.OPENROUTER_API_KEY === undefined || env.OPENROUTER_API_KEY === "")
    throw new Error("Missing credential");
  await streamModel(
    options.clientFor(env.OPENROUTER_API_KEY),
    {
      messages: author.messages,
      tools,
      system: `${system}\nFrozen workflow: ${JSON.stringify(author.workflow.config)}\nSupported checks: ${JSON.stringify(simulationChecks)}`,
    },
    {
      signal,
      text(text) {
        reply.text += text;
        emit({ kind: "text", text });
      },
      toolStarted(toolId, tool) {
        emit({ kind: "tool-start", id: toolId, tool });
      },
      execute: proposalTool(author, proposed, signal),
    },
  );
}

async function completeTurn(turn: Turn) {
  const { options, author, env, signal, emit } = turn;
  const proposed: { current: Proposal } = { current: { kind: "empty" } };
  try {
    await proposeTurn(turn, proposed);
    signal.throwIfAborted();
    if (proposed.current.kind === "valid")
      await holdDraft(options, author, proposed.current.definition, env, signal);
    emit({
      kind: "author-end",
      draft: author.draft,
      error:
        proposed.current.kind === "rejected"
          ? "The proposal was rejected. Ask for a supported complete test in chat. Nothing saved."
          : null,
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
  return simulationStream(
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
