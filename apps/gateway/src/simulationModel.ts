import type { Anthropic } from "@anthropic-ai/sdk";
import { assistantContent, newRound, readEvent } from "./playgroundRound";
import type { SimulationDriver } from "./simulation";

type ModelRequest = {
  messages: Anthropic.MessageParam[];
  system: string;
  tools: Anthropic.Tool[];
  onModel?: (model: string) => void;
};
type ModelRun = Pick<
  Parameters<SimulationDriver>[0],
  "execute" | "text" | "toolStarted" | "signal"
>;

/** Existing gateway model for both isolated employee and customer conversations. */
export const SIMULATION_MODEL = "moonshotai/kimi-k3";

const modelReply = async (
  client: Anthropic,
  request: ModelRequest,
  run: ModelRun,
  round: number,
  text: (block: string, delta: string) => void,
) => {
  const signal = AbortSignal.any([run.signal, AbortSignal.timeout(20000)]);
  try {
    const response = await client.messages.create(
      {
        model: SIMULATION_MODEL,
        max_tokens: 1400,
        thinking: { type: "disabled" },
        system: request.system,
        tools: request.tools,
        messages: request.messages,
        stream: true,
      },
      { signal, timeout: 20000, maxRetries: 0 },
    );
    let state = newRound(round);
    for await (const event of response) {
      signal.throwIfAborted();
      if (event.type === "message_start" && event.message.model.length > 0)
        request.onModel?.(event.message.model);
      const step = readEvent(state, event);
      state = step.round;
      if (event.type === "content_block_start" && event.content_block.type === "tool_use")
        run.toolStarted(`t${round}_${event.index}`, event.content_block.name);
      if (step.text !== undefined) text(step.text.blockId, step.text.delta);
    }
    signal.throwIfAborted();
    if (state.stop !== "tool_use" && state.stop !== "end_turn")
      throw new Error("Incomplete model reply");
    return { content: assistantContent(state), stop: state.stop };
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  }
};

/** Streams genuine text and tool activity. Incomplete replies never execute tools.
 * @throws On upstream failure, cancellation, provider timeout, or exhausted support rounds.
 */
export function streamModel(
  client: Anthropic,
  request: ModelRequest,
  run: ModelRun,
): Promise<void> {
  let blockId: string | undefined;
  const text = (block: string, delta: string) => {
    if (blockId !== undefined && blockId !== block) run.text("\n\n");
    blockId = block;
    run.text(delta);
  };
  const nextRound = async (round: number): Promise<void> => {
    run.signal.throwIfAborted();
    if (round === 4) throw new DOMException("Round limit", "QuotaExceededError");
    const { content, stop } = await modelReply(client, request, run, round, text);
    request.messages.push({ role: "assistant", content });
    const calls = content.filter((block) => block.type === "tool_use");
    if (
      stop === "end_turn" &&
      calls.length === 0 &&
      content.some((block) => block.type === "text" && block.text.trim().length > 0)
    )
      return;
    if (calls.length === 0) throw new Error("Missing tool call");
    request.messages.push({
      role: "user",
      content: calls.map((call): Anthropic.ToolResultBlockParam => {
        const output = run.execute(call.name, call.input);
        return {
          type: "tool_result",
          tool_use_id: call.id,
          is_error: output.ok === false,
          content: JSON.stringify(output),
        };
      }),
    });
    return nextRound(round + 1);
  };
  return nextRound(0);
}
