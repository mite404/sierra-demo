import type { Anthropic } from "@anthropic-ai/sdk";
import type { ToolCall } from "./playgroundTools";

// A text block as it streams. Leading whitespace is held until a visible character arrives,
// so a block of nothing but spaces (Kimi opens tool rounds with " ") never reaches the page.
type TextBlock = { kind: "text"; blockId: string; text: string; held: string; started: boolean };
// A tool call as it streams: its input arrives as JSON fragments, parsed once at the stop.
type ToolBlock = {
  kind: "tool";
  id: string;
  name: string;
  json: string;
  startInput: unknown;
  input: ToolCall["input"] | null;
};
// Raw reasoning is transient input to the gateway's summarizer, never the page or history.
type ThinkingBlock = { kind: "thinking"; blockId: string };
type Block = TextBlock | ThinkingBlock | ToolBlock | { kind: "other" };

/** One model round as read so far: its content blocks by stream index and why it stopped. */
export type Round = Readonly<{
  number: number;
  blocks: Readonly<Record<number, Block>>;
  stop: Anthropic.StopReason | null;
}>;

/** What one stream event changed: the round, plus words or reasoning to show or a finished call. */
export type RoundStep = {
  round: Round;
  text?: { blockId: string; delta: string };
  thinking?: { blockId: string; delta: string };
  tool?: ToolCall;
};

// Holds whitespace until the block has something to show; → the block and the text to emit.
const holdWhitespace = (block: TextBlock, delta: string): { block: TextBlock; out: string } => {
  const text = block.text + delta;
  if (block.started) return { block: { ...block, text }, out: delta };
  const held = block.held + delta;
  if (!/\S/.test(held)) return { block: { ...block, text, held }, out: "" };
  return { block: { ...block, text, held: "", started: true }, out: held.trimStart() };
};

const parseInput = (json: string): ToolCall["input"] => {
  try {
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch {
    return { ok: false };
  }
};

const withBlock = (round: Round, index: number, block: Block): Round => ({
  ...round,
  blocks: { ...round.blocks, [index]: block },
});

// A text block's new characters, held or shown.
const appendText = (round: Round, index: number, block: TextBlock, delta: string): RoundStep => {
  const { block: next, out } = holdWhitespace(block, delta);
  const step = { round: withBlock(round, index, next) };
  return out === "" ? step : { ...step, text: { blockId: next.blockId, delta: out } };
};

// A thinking block's new reasoning; an empty delta shows nothing.
const appendThinking = (round: Round, block: ThinkingBlock, delta: string): RoundStep =>
  delta === "" ? { round } : { round, thinking: { blockId: block.blockId, delta } };

// A block's opening. Ids are the gateway's own (text and thinking `r{round}b{index}`, tool
// calls `t{round}_{index}`), unique across the turn whatever the model mints.
const startBlock = (round: Round, index: number, content: Anthropic.ContentBlock): RoundStep => {
  const blockId = `r${round.number}b${index}`;
  if (content.type === "text") {
    const block: TextBlock = { kind: "text", blockId, text: "", held: "", started: false };
    return appendText(round, index, block, content.text);
  }
  if (content.type === "thinking") {
    const block: ThinkingBlock = { kind: "thinking", blockId };
    return appendThinking(withBlock(round, index, block), block, content.thinking);
  }
  if (content.type !== "tool_use") return { round: withBlock(round, index, { kind: "other" }) };
  const id = `t${round.number}_${index}`;
  const block: ToolBlock = {
    kind: "tool",
    id,
    name: content.name,
    json: "",
    startInput: content.input,
    input: null,
  };
  return { round: withBlock(round, index, block) };
};

// A tool block's end: its input is whatever JSON streamed, or the start's input when none did.
const stopBlock = (round: Round, index: number, block: ToolBlock): RoundStep => {
  const input =
    block.json === ""
      ? { ok: true as const, value: block.startInput ?? {} }
      : parseInput(block.json);
  const tool: ToolCall = { id: block.id, name: block.name, input };
  return { round: withBlock(round, index, { ...block, input }), tool };
};

const applyDelta = (round: Round, event: Anthropic.RawContentBlockDeltaEvent): RoundStep => {
  const block = round.blocks[event.index];
  if (block === undefined) return { round };
  const { delta } = event;
  switch (block.kind) {
    case "text":
      return delta.type === "text_delta"
        ? appendText(round, event.index, block, delta.text)
        : { round };
    case "thinking":
      return delta.type === "thinking_delta"
        ? appendThinking(round, block, delta.thinking)
        : { round };
    case "tool":
      return delta.type === "input_json_delta"
        ? {
            round: withBlock(round, event.index, {
              ...block,
              json: block.json + delta.partial_json,
            }),
          }
        : { round };
    case "other":
      return { round };
    default: {
      const unhandled: never = block;
      return unhandled;
    }
  }
};

/** A round before its first event. */
export const newRound = (number: number): Round => ({ number, blocks: {}, stop: null });

/** Folds one upstream stream event into the round. Pure: the loop does the I/O. */
export function readEvent(round: Round, event: Anthropic.RawMessageStreamEvent): RoundStep {
  switch (event.type) {
    case "content_block_start":
      return startBlock(round, event.index, event.content_block);
    case "content_block_delta":
      return applyDelta(round, event);
    case "content_block_stop": {
      const block = round.blocks[event.index];
      return block?.kind === "tool" ? stopBlock(round, event.index, block) : { round };
    }
    case "message_delta":
      return { round: { ...round, stop: event.delta.stop_reason ?? round.stop } };
    case "message_start":
    case "message_stop":
      return { round };
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

// Blocks in stream order.
const ordered = (round: Round): Block[] =>
  Object.entries(round.blocks)
    .toSorted(([a], [b]) => Number(a) - Number(b))
    .map(([, block]) => block);

/**
 * The round as the assistant message the model reads back next round: visible text and the
 * finished tool calls, in order. Thinking is dropped: only a summary reaches the page, and the model never
 * reads it back, which Kimi accepts. A call whose input is not an object is sent with an empty
 * one beside its error result.
 */
export function assistantContent(round: Round): Anthropic.ContentBlockParam[] {
  return ordered(round).flatMap((block): Anthropic.ContentBlockParam[] => {
    if (block.kind === "text") return block.started ? [{ type: "text", text: block.text }] : [];
    if (block.kind !== "tool" || block.input === null) return [];
    const { input: parsed } = block;
    const input =
      parsed.ok && typeof parsed.value === "object" && parsed.value !== null ? parsed.value : {};
    return [{ type: "tool_use", id: block.id, name: block.name, input }];
  });
}
