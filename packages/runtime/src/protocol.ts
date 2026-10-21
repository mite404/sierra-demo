import type { AgentEvent, SharedFile } from "@yaklabs/catalog/agent";
import type { CardAttachment } from "@yaklabs/catalog/interactive";
import { blockSchema } from "@yaklabs/catalog/prose";
import { endedSchema, failureSchema, replyChunkSchema, workSchema } from "@yaklabs/catalog/reply";
import { z } from "zod";
import {
  laneIdSchema,
  laneSchema,
  projectIdSchema,
  shellStateSchema,
  threadIdSchema,
  threadShareSchema,
  workspaceSchema,
} from "./workspace";
import { markNoteSchema, threadMarkSchema } from "./marks";

// The catalog owns these shapes. Each schema is typed against the catalog's own type, so a
// field the catalog adds or retypes fails to compile here until the schema learns it.
const idSchema = z.string().min(1);
const nameSchema = z.string().min(1);

const cardAttachmentSchema: z.ZodType<CardAttachment> = z.object({
  turnId: z.string(),
  label: z.string(),
  state: z.object({ measure: z.string() }),
});

const sharedFileSchema: z.ZodType<SharedFile> = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number().nonnegative(),
});

// What the thread tells the agent (ADR-041), checked where it crosses into the worker.
const agentEventSchema: z.ZodType<AgentEvent> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("message"),
    text: z.string(),
    attachments: z.array(cardAttachmentSchema),
    files: z.array(sharedFileSchema).optional(),
  }),
  z.object({ kind: z.literal("answer"), text: z.string() }),
  z.object({ kind: z.literal("question-rejected"), reason: z.string(), question: z.unknown() }),
]);

/**
 * One stored turn: a user's request or answer, or an agent's reply as the seam folded it
 * (ADR-147). Card payloads and a question stay `unknown`: the catalog validates them when it
 * renders. Left untyped so its tests can hold it equal to `ThreadMessage`, since a field this
 * schema lacks is dropped from every turn it reads.
 */
export const threadMessageSchema = z.discriminatedUnion("role", [
  z.object({
    id: idSchema,
    role: z.literal("user"),
    text: z.string(),
    time: z.string(),
    attachments: z.array(cardAttachmentSchema).optional(),
    files: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
    question: z.string().optional(),
  }),
  z.object({
    id: idSchema,
    role: z.literal("agent"),
    text: z.string(),
    time: z.string(),
    payload: z.unknown().optional(),
    interactive: z.unknown().optional(),
    streaming: z.boolean().optional(),
    blocks: z.array(blockSchema).optional(),
    work: workSchema.optional(),
    activity: z.string().optional(),
    thinking: z.string().optional(),
    ended: endedSchema.optional(),
    failure: failureSchema.optional(),
    asks: z.unknown().optional(),
  }),
]);

// Which agent answers: the scripted lab stand-in, or the model behind the gateway (ADR-085).
const agentSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lab") }),
  // Absolute, because the worker resolves it; the page passes its own origin (ADR-086).
  z.object({ kind: z.literal("gateway"), baseUrl: z.url() }),
]);

// The v1 canvas's two localStorage keys, which only the 1 → 2 migration reads.
const legacyCanvasSchema = z.object({
  hidden: z.array(z.string()),
  order: z.array(z.string()),
});

/** The mock scenarios a page may ask for (ADR-096); each loads the same every time. */
export const scenarioNames = [
  "demo",
  "empty",
  "long",
  "loading",
  "failure",
  "thread-fails",
] as const;
const scenarioNameSchema = z.enum(scenarioNames);

// Where the worker's data lives: the device's store, in the private file system or, when the
// browser refuses it, in memory for this tab; or a scenario, which never touches the device.
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("device"), storage: z.enum(["opfs", "memory"]) }),
  z.object({ kind: z.literal("scenario"), name: scenarioNameSchema }),
]);

// What the page asks the worker to open. A dev build may ask for `seed`: the browser levers'
// device, the Demo store and its profit thread that every device held before the Live
// Playground (`seedDemoStore`), written beside whatever the store holds.
const runtimeDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("device"),
    legacy: legacyCanvasSchema.optional(),
    seed: z.literal("demo-store").optional(),
  }),
  z.object({ kind: z.literal("scenario"), name: scenarioNameSchema }),
]);

// Something new: a project, a main thread in one ("New thread" when untitled), or a child
// started from a highlight, its lane at `at` on its parent's canvas.
const newItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), name: nameSchema }),
  z.object({ kind: z.literal("main"), projectId: projectIdSchema, title: nameSchema.optional() }),
  z.object({
    kind: z.literal("child"),
    parentId: threadIdSchema,
    at: z.int(),
    title: nameSchema,
    draft: z.string(),
  }),
]);

const renameTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), id: projectIdSchema }),
  z.object({ kind: z.literal("thread"), id: threadIdSchema }),
]);

/** Everything the page may ask of the worker (ADR-076, ADR-086); all but `init` name a request. */
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("init"), agent: agentSpecSchema, data: runtimeDataSchema }),
  z.object({ kind: z.literal("open"), requestId: idSchema, threadId: threadIdSchema }),
  z.object({ kind: z.literal("create"), requestId: idSchema, item: newItemSchema }),
  z.object({
    kind: z.literal("rename"),
    requestId: idSchema,
    target: renameTargetSchema,
    name: nameSchema,
  }),
  // `base` is the lane ids `lanes` was edited from, so a lane added since is kept, not dropped.
  z.object({
    kind: z.literal("arrange"),
    requestId: idSchema,
    mainId: threadIdSchema,
    lanes: z.array(laneSchema),
    base: z.array(laneIdSchema),
  }),
  z.object({ kind: z.literal("saveShell"), requestId: idSchema, shell: shellStateSchema }),
  // The thread menu's writes (ADR-126): a pin, a snooze or an archive, with the bell's note it
  // leaves, if any; a delete and its undo; and the device's record of a thread made public, and
  // its end.
  z.object({
    kind: z.literal("mark"),
    requestId: idSchema,
    threadId: threadIdSchema,
    change: threadMarkSchema,
    note: markNoteSchema.optional(),
  }),
  z.object({ kind: z.literal("delete"), requestId: idSchema, threadId: threadIdSchema }),
  z.object({ kind: z.literal("restore"), requestId: idSchema, threadId: threadIdSchema }),
  z.object({ kind: z.literal("share"), requestId: idSchema, share: threadShareSchema }),
  z.object({ kind: z.literal("unshare"), requestId: idSchema, shareId: idSchema }),
  z.object({
    kind: z.literal("send"),
    requestId: idSchema,
    threadId: threadIdSchema,
    event: agentEventSchema,
    accessToken: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal("abort"), requestId: idSchema }),
]);

/**
 * Everything the worker may tell the page. `held` says another tab has the device's database
 * and this worker waits for it; `state` is pushed after every write, before that write's
 * answer; the other answers name their request; `broken` is what no request caused.
 */
export const noticeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("held") }),
  z.object({ kind: z.literal("opening"), source: sourceSchema }),
  z.object({
    kind: z.literal("state"),
    source: sourceSchema,
    workspace: workspaceSchema,
    replying: z.array(threadIdSchema),
  }),
  z.object({
    kind: z.literal("opened"),
    requestId: idSchema,
    messages: z.array(threadMessageSchema),
  }),
  z.object({ kind: z.literal("created"), requestId: idSchema, id: idSchema }),
  z.object({ kind: z.literal("done"), requestId: idSchema }),
  z.object({ kind: z.literal("failed"), requestId: idSchema, reason: z.string() }),
  // One piece of a reply as the agent yielded it: words, or an event around them (ADR-147).
  z.object({ kind: z.literal("chunk"), requestId: idSchema, chunk: replyChunkSchema }),
  z.object({ kind: z.literal("broken"), reason: z.string() }),
]);

/** A message from the page to the worker. */
export type Command = z.infer<typeof commandSchema>;
/** A message from the worker to the page. */
export type Notice = z.infer<typeof noticeSchema>;
/** The agent the worker runs, chosen once at `init`. */
export type AgentSpec = z.infer<typeof agentSpecSchema>;
/** The v1 canvas's hidden lanes and lane order, as the page read them from localStorage. */
export type LegacyCanvas = z.infer<typeof legacyCanvasSchema>;
/** A mock scenario's name. */
export type ScenarioName = z.infer<typeof scenarioNameSchema>;
/** Where the worker's data lives, so the page can say whether anything is kept. */
export type Source = z.infer<typeof sourceSchema>;
/** What the page asks the worker to open at start. */
export type RuntimeData = z.infer<typeof runtimeDataSchema>;
/** Something the page asks the worker to create; the worker mints its id. */
export type NewItem = z.infer<typeof newItemSchema>;
/** What a rename names: a project or a thread. */
export type RenameTarget = z.infer<typeof renameTargetSchema>;
