import type { Anthropic } from "@anthropic-ai/sdk";
import { assistantContent, newRound, readEvent } from "./playgroundRound";
import type { SimulationDriver } from "./simulation";

/** Existing gateway model for both isolated employee and customer conversations. */
export const SIMULATION_MODEL = "moonshotai/kimi-k3";

/** Streams real upstream text and tool activity, ignoring provider thinking. Incomplete rounds never execute tools.
 * @throws When upstream fails, execution is aborted, or the bounded round limit is exhausted.
 */
export async function streamModel(
  client: Anthropic,
  request: {
    messages: Anthropic.MessageParam[];
    system: string;
    tools: Anthropic.Tool[];
  },
  run: Pick<Parameters<SimulationDriver>[0], "execute" | "text" | "toolStarted" | "signal">,
) {
  const { messages, system, tools } = request;
  const { signal, text, toolStarted, execute } = run;
  let visible = false;
  for (let round = 0; round < 4; round++) {
    signal.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- each round consumes the preceding tool result
    const response = await client.messages.create(
      {
        model: SIMULATION_MODEL,
        max_tokens: 1400,
        thinking: { type: "disabled" },
        system,
        tools,
        messages,
        stream: true,
      },
      { signal, timeout: 20000, maxRetries: 0 },
    );
    let state = newRound(round);
    let blockId: string | undefined;
    for await (const event of response) {
      signal.throwIfAborted();
      const step = readEvent(state, event);
      state = step.round;
      if (event.type === "content_block_start" && event.content_block.type === "tool_use")
        toolStarted(`t${round}_${event.index}`, event.content_block.name);
      if (step.text) {
        if (visible && blockId !== step.text.blockId) text("\n\n");
        blockId = step.text.blockId;
        visible = true;
        text(step.text.delta);
      }
    }
    signal.throwIfAborted();
    if (state.stop !== "tool_use" && state.stop !== "end_turn")
      throw new Error("Incomplete model reply");
    const content = assistantContent(state);
    messages.push({ role: "assistant", content });
    const calls = content.filter((block) => block.type === "tool_use");
    if (
      state.stop === "end_turn" &&
      calls.length === 0 &&
      content.some((block) => block.type === "text" && block.text.trim())
    )
      return;
    if (calls.length === 0) throw new Error("Missing tool call");
    messages.push({
      role: "user",
      content: calls.map((call): Anthropic.ToolResultBlockParam => {
        const output = execute(call.name, call.input);
        return {
          type: "tool_result",
          tool_use_id: call.id,
          is_error: output.ok === false,
          content: JSON.stringify(output),
        };
      }),
    });
  }
  throw new Error("Round limit");
}
