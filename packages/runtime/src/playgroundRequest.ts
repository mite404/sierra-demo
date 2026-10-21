import type { AgentEvent } from "@yaklabs/catalog/agent";
import { resolveAwaiting } from "@yaklabs/catalog/awaiting";
import { playgroundRequestSchema, type PlaygroundRequest } from "@yaklabs/catalog/playground";
import { plainText } from "@yaklabs/catalog/prose";
import type { AgentMessage } from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { z, type ZodType } from "zod";

// The gateway keeps nothing between requests (ADR-155), so every request carries the thread's
// history, projected from the stored turns alone: the agent keeps no record of its own, and
// the same turns always make the same request.

type Exchange = PlaygroundRequest["exchanges"][number];
type PastAgent = NonNullable<Exchange["agent"]>;
type UserMessage = Extract<ThreadMessage, { role: "user" }>;
// One exchange as the thread holds it: the user's turn and the reply that settled it, if any.
type Held = { user: UserMessage; agent: AgentMessage | undefined };

/** What to do for an event: send this request, or nothing, since it would not pass the check. */
export type Plan =
  | { kind: "send"; request: PlaygroundRequest }
  | { kind: "refuse"; reason: string };

// The request schema's parts, so each piece is checked where it is built and a stored turn
// that cannot be sent is left out rather than failing every later request.
const exchangeSchema = playgroundRequestSchema.shape.exchanges.element;
const userSchema = exchangeSchema.shape.user;
const agentShape = exchangeSchema.shape.agent.unwrap().shape;
// The request schema's caps: fifty exchanges with the one being asked, and a reply's text.
const MAX_PAST = 49;
const MAX_TEXT = 20_000;
const MAX_EACH = 12;

// The items of `values` that `schema` accepts, up to the cap on each list of a reply.
function kept<T>(schema: ZodType<T>, values: readonly unknown[]): T[] {
  return values
    .flatMap((value) => {
      const parsed = schema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, MAX_EACH);
}

// A reply that showed the reader nothing (no words, card, step or question) was an attempt
// the model never took part in, like a refusal before the first byte; a retry repeats it.
function showedNothing(agent: AgentMessage): boolean {
  const words = agent.blocks === undefined ? agent.text : plainText(agent.blocks);
  return (
    words.trim() === "" &&
    (agent.blocks ?? []).length === 0 &&
    (agent.work?.steps ?? []).length === 0 &&
    agent.asks === undefined
  );
}

// User turns open exchanges and the next agent turn settles one; an agent turn with no open
// exchange (a seeded greeting, a second reply to one message) has no user side to pair with.
function exchangesOf(messages: readonly ThreadMessage[]): Held[] {
  const held: Held[] = [];
  for (const message of messages) {
    const last = held.at(-1);
    if (message.role === "user") held.push({ user: message, agent: undefined });
    else if (last !== undefined && last.agent === undefined) last.agent = message;
  }
  return held;
}

// The question a reply ended on, when the catalog's check would dock it, under the id its
// position gives it.
function questionOf(agent: AgentMessage | undefined, index: number): PastAgent["question"] {
  const checked = resolveAwaiting(agent?.asks); // → AwaitingResult
  return checked.kind === "approved"
    ? { questionId: `q${index}`, question: checked.question }
    : undefined;
}

// What the reader saw of a reply, in the gateway's words. A card keeps the id it came with,
// else takes its position. A limitation is carried once, as a failure: said in the words, or
// on its failed step, or both. The words leave limitations out, since the failures carry them.
function pastAgent(agent: AgentMessage, index: number): PastAgent {
  const blocks = agent.blocks ?? [];
  const steps = agent.work?.steps ?? [];
  const cards = blocks
    .flatMap((block) => (block.kind === "card" ? [block] : []))
    .map((block, n) => ({ cardId: block.id ?? `c${n + 1}`, selection: block.payload }));
  const outcomes = steps
    .filter((step) => step.status === "done")
    .map((step) => ({ workId: step.id, result: step.outcome }));
  const limitations = new Set([
    ...blocks.flatMap((block) => (block.kind === "limitation" ? [block.text] : [])),
    ...steps.flatMap((step) =>
      step.status === "failed" && step.outcome !== undefined ? [step.outcome] : [],
    ),
    ...(agent.failure === undefined ? [] : [agent.failure.title]),
  ]); // → Set<string>, each limitation once, in the order the reader met them
  const words = blocks.filter((block) => block.kind !== "limitation");
  const question = questionOf(agent, index);
  return {
    text: (agent.blocks === undefined ? agent.text : plainText(words)).slice(0, MAX_TEXT),
    cards: kept(agentShape.cards.element, cards),
    outcomes: kept(agentShape.outcomes.element, outcomes),
    failures: kept(
      agentShape.failures.element,
      [...limitations].map((limitation) => ({ limitation })),
    ),
    ...(question === undefined ? {} : { question }),
  };
}

// The user's side: an answer when it answers the question the exchange before it asked and
// fits an answer, else what they said. A later message after an open question is a `say`,
// which the gateway reads as a skip.
function userInput(text: string, answered: boolean, before: PastAgent | undefined): unknown {
  const questionId = before?.question?.questionId;
  const answer = { kind: "answer", questionId, text };
  if (answered && questionId !== undefined && userSchema.safeParse(answer).success) return answer;
  return { kind: "say", text };
}

/**
 * The thread's turns as the gateway takes them: the stored transcript, with the user turn the
 * worker saved for this event left out, since the event itself carries it.
 */
export function historyBefore(messages: ThreadMessage[], event: AgentEvent): ThreadMessage[] {
  const savedTurn = event.kind !== "question-rejected" && messages.at(-1)?.role === "user";
  return savedTurn ? messages.slice(0, -1) : messages;
}

/**
 * The request for a message or an answer, projected from the thread's turns before it. Pure.
 * An attempt that showed nothing is dropped, so Try again sends the identical request; a
 * question pairs with its answer by position; stored turns the request cannot carry are left
 * out; the newest 49 exchanges are kept. The whole request is checked with the request schema,
 * and a request that fails is refused, never sent.
 */
export function planRequest(
  history: readonly ThreadMessage[],
  event: Extract<AgentEvent, { kind: "message" | "answer" }>,
): Plan {
  const shown = exchangesOf(history).filter(
    (held) => held.agent !== undefined && !showedNothing(held.agent),
  ); // → Held[], each settled by a reply the reader saw
  const past: Exchange[] = [];
  for (const held of shown.slice(-MAX_PAST)) {
    const before = past.at(-1)?.agent;
    const user = userSchema.safeParse(
      userInput(held.user.text, held.user.question !== undefined, before),
    );
    if (!user.success || held.agent === undefined) continue;
    past.push({ user: user.data, agent: pastAgent(held.agent, past.length) });
  }
  const asked = userInput(event.text, event.kind === "answer", past.at(-1)?.agent);
  const request = playgroundRequestSchema.safeParse({ exchanges: [...past, { user: asked }] });
  return request.success
    ? { kind: "send", request: request.data }
    : { kind: "refuse", reason: z.prettifyError(request.error) };
}
