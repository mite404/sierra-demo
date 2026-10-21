import type { Anthropic } from "@anthropic-ai/sdk";
import type { PlaygroundRequest, UserInput } from "@yaklabs/catalog/playground";

type Exchange = PlaygroundRequest["exchanges"][number];
type AgentTurn = NonNullable<Exchange["agent"]>;
type Turn = { role: "user" | "assistant"; content: Anthropic.ContentBlockParam[] };
// One past tool call rebuilt from the page's record, with the result the model got for it.
type PastCall = { use: Anthropic.ToolUseBlockParam; result: string };
type PastSpec = { name: string; input: unknown; result: string };

const SHOWN = "shown";
const OK = "ok";

// What the model learns about its question from the user's next input.
const questionResult = (questionId: string, next: UserInput | undefined): string => {
  if (next?.kind === "answer" && next.questionId === questionId)
    return `The user answered: ${next.text}`;
  return "The user skipped this question.";
};

// A past agent turn's calls, in the order the page shows them. Ids are `h{exchange}_{n}`,
// unique across the conversation whatever ids the model minted at the time.
const pastCalls = (agent: AgentTurn, exchange: number, next: UserInput | undefined): PastCall[] => {
  const calls: PastSpec[] = [
    ...agent.cards.map(({ cardId, selection }) => ({
      name: "show_card",
      input: { cardId, card: selection },
      result: SHOWN,
    })),
    ...agent.outcomes.map(({ workId, result }) => ({
      name: "report_outcome",
      input: { workId, result, evidence: [] },
      result: OK,
    })),
    ...agent.failures.map(({ limitation }) => ({
      name: "report_failure",
      input: { limitation },
      result: OK,
    })),
    ...(agent.question === undefined
      ? []
      : [
          {
            name: "ask_question",
            input: { question: agent.question.question },
            result: questionResult(agent.question.questionId, next),
          },
        ]),
  ];
  return calls.map(({ name, input, result }, n) => ({
    use: { type: "tool_use", id: `h${exchange}_${n}`, name, input },
    result,
  }));
};

// The user's own words for an exchange; an answer or skip its question already carries is
// left out, since the tool_result says it.
const userText = (user: UserInput, previous: AgentTurn | undefined): Anthropic.TextBlockParam[] => {
  const answered = previous?.question?.questionId;
  switch (user.kind) {
    case "say":
      return [{ type: "text", text: user.text }];
    case "answer":
      return user.questionId === answered ? [] : [{ type: "text", text: user.text }];
    case "skip":
      return user.questionId === answered ? [] : [{ type: "text", text: "I'll skip that." }];
    default: {
      const unhandled: never = user;
      return unhandled;
    }
  }
};

// Joins neighbours with the same role and drops empty turns, so roles alternate.
const alternate = (turns: readonly Turn[]): Turn[] => {
  const merged: Turn[] = [];
  for (const turn of turns) {
    const last = merged.at(-1);
    if (turn.content.length === 0) continue;
    if (last?.role === turn.role)
      merged[merged.length - 1] = { role: last.role, content: [...last.content, ...turn.content] };
    else merged.push(turn);
  }
  return merged;
};

// The turns one exchange contributes: the user's message (led by the tool_results of the agent
// turn before it) and, for any exchange but the last, the agent's reply.
const exchangeTurns = (exchanges: readonly Exchange[], index: number): Turn[] => {
  const exchange = exchanges[index];
  if (exchange === undefined) return [];
  const previous = index > 0 ? exchanges[index - 1]?.agent : undefined;
  const results = (previous === undefined ? [] : pastCalls(previous, index - 1, exchange.user)).map(
    ({ use, result }): Anthropic.ToolResultBlockParam => ({
      type: "tool_result",
      tool_use_id: use.id,
      content: result,
    }),
  );
  const user: Turn = { role: "user", content: [...results, ...userText(exchange.user, previous)] };
  const agent = index < exchanges.length - 1 ? exchange.agent : undefined;
  if (agent === undefined) return [user];
  const text: Anthropic.TextBlockParam[] =
    agent.text.trim() === "" ? [] : [{ type: "text", text: agent.text }];
  const uses = pastCalls(agent, index, exchanges[index + 1]?.user).map(({ use }) => use);
  return [user, { role: "assistant", content: [...text, ...uses] }];
};

/**
 * Rebuilds the Anthropic messages for the page's history. Each past agent turn becomes its
 * prose plus one tool_use per card, outcome, failure and question, and the next user message
 * opens with a tool_result for each; a question's result is the user's answer or skip. Roles
 * alternate, the first and last messages are the user's, and every tool_use is answered in
 * the message right after it.
 */
export function toUpstreamMessages({ exchanges }: PlaygroundRequest): Anthropic.MessageParam[] {
  const turns = exchanges.flatMap((_, index) => exchangeTurns(exchanges, index)); // → Turn[]
  return alternate(turns); // → MessageParam[], user first
}
