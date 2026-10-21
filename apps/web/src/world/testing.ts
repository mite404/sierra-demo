import type { AgentEvent } from "@yaklabs/catalog/agent";
import type { ReplyChunk } from "@yaklabs/catalog/reply";
import type { ThreadMessage } from "@yaklabs/catalog/thread";
import { threadIdSchema, type RuntimeState, type ThreadId, type Workspace } from "@yaklabs/runtime";
import type { Clock } from "../demo/clock";
import type { Script } from "../demo/script";
import { DEMO_WORLD } from "./demo";
import { ids } from "./ids";
import { show, worldOf } from "./spec";
import { createWorld, type World } from "./world";

// A clock on which every wait is over at once.
const instant: Clock = {
  state: () => ({ rate: 1, paused: false }),
  subscribe: () => () => {},
  wait: () => Promise.resolve(),
  setRate: () => {},
  pause: () => {},
  resume: () => {},
};

export const idOf = (value: string): ThreadId => threadIdSchema.parse(value);
export const [BRIEF, INTERRUPTED, RETURNED] = ["brief", "interrupted", "returned"].map((each) =>
  ids.show(each),
);

export const ask = (text: string): AgentEvent => ({ kind: "message", text, attachments: [] });

export const lastTurn = (turns: ThreadMessage[]) => turns.at(-1);

// The Demo, or a world of `scripts`, played on the instant clock with no panels mounted.
export function playing(scripts?: Script[]): World {
  const spec =
    scripts === undefined
      ? DEMO_WORLD
      : worldOf({
          projects: [
            {
              id: ids.project,
              name: "Demo",
              threads: [show(scripts[0]), ...scripts.slice(1).map((script) => show(script))],
            },
          ],
        });
  return createWorld(spec, { panels: new Map(), clock: () => instant, reduceMotion: () => false });
}

export function workspaceOf(state: RuntimeState): Workspace {
  if (state.kind !== "ready") throw new Error(`The world is ${state.kind}`);
  return state.workspace;
}

export function replyingOf(state: RuntimeState): string[] {
  return state.kind === "ready" ? [...state.replying] : [];
}

// The words of text chunks, in order.
export function wordsOf(chunks: ReplyChunk[]): string[] {
  return chunks.flatMap((chunk) =>
    typeof chunk !== "string" && chunk.kind === "text" ? [chunk.text] : [],
  );
}

// The chunks of the script's first reply, as written.
export function firstReply(script: Script): ReplyChunk[] {
  const reply = script.beats.find((beat) => beat.kind === "reply");
  return reply?.kind === "reply" ? reply.events.map(({ chunk }) => chunk) : [];
}

// Whether a chunk is the step that starts the named child.
function starts(chunk: ReplyChunk, local: string): boolean {
  return typeof chunk !== "string" && chunk.kind === "step" && chunk.step.id === local;
}

// What does `act` as the step that starts the named child goes by.
export function onStart(local: string, act: () => void): (chunk: ReplyChunk) => void {
  return (chunk) => {
    if (starts(chunk, local)) act();
  };
}

// Every chunk of one reply to `main`, with `each` seeing them as they come.
export async function drain(
  world: World,
  main: ThreadId,
  event: AgentEvent,
  signal = new AbortController().signal,
  each: (chunk: ReplyChunk) => void = () => {},
): Promise<ReplyChunk[]> {
  const chunks: ReplyChunk[] = [];
  for await (const chunk of world.agent(main).respond(event, signal)) {
    chunks.push(chunk);
    each(chunk);
  }
  return chunks;
}

// The `replying` lists a world shows, each once, in the order they came.
export function recordReplying(world: World): string[][] {
  const seen: string[][] = [[]];
  world.subscribe(() => {
    const now = replyingOf(world.state());
    if (seen.at(-1)?.join() !== now.join()) seen.push(now);
  });
  return seen;
}
