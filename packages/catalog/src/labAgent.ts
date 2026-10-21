import type { Agent, AgentEvent } from "./agent";

// A pause before replying, so a reply reads as a response rather than an echo.
const REPLY_DELAY_MS = 700;
// Time between streamed words: fast enough to read as live, slow enough to see.
const WORD_MS = 45;

// Resolves after `ms`, or early and silently if the reply is abandoned.
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(id), resolve()), { once: true });
  });
}

// The wording of a rejected question, when it has a non-blank one to reuse. The question failed
// the schema, so it arrives as `unknown` and is read only as far as this check proves.
function rejectedWording(question: unknown): string | undefined {
  if (typeof question !== "object" || question === null || !("question" in question))
    return undefined;
  const wording = question.question; // → unknown
  if (typeof wording !== "string" || wording.trim() === "") return undefined;
  return wording.trim();
}

// What the stand-in says for each event.
function replyText(event: AgentEvent): string {
  switch (event.kind) {
    case "message": {
      if (event.attachments.length === 0 && event.files?.length) {
        const names = event.files.map((file) => file.name).join(", ");
        return `Got ${names}. In the lab I can't look inside files, but a real agent would read it with your message.`;
      }
      if (event.attachments.length === 0)
        return "Noted. In the lab I answer from a script, so a real agent would take it from here.";
      const views = event.attachments.map((item) => item.label).join(" and ");
      return `Answering about ${views}, the view you set on the card. Saturday leads at every level, so the weekend carries the week.`;
    }
    case "answer":
      return `Got it: "${event.text}". Carrying on from there.`;
    case "question-rejected": {
      // A real agent reads `reason`; the stand-in only reuses its own question when it was sound.
      const wording = rejectedWording(event.question); // → string | undefined
      return wording === undefined
        ? "I need a bit more context before I carry on. What would you like me to do next?"
        : `${wording} Tell me in a sentence or two and I'll carry on from there.`;
    }
    default: {
      // A new event kind fails to compile here until the stand-in has a line for it.
      const unhandled: never = event;
      return unhandled;
    }
  }
}

/**
 * A scripted stand-in for the agent runtime (ADR-041), so the round trip is visible without a
 * model. It streams a canned reply word by word; the timings are adjustable for tests.
 */
export function createLabAgent({
  replyDelayMs = REPLY_DELAY_MS,
  wordMs = WORD_MS,
}: { replyDelayMs?: number; wordMs?: number } = {}): Agent {
  return {
    async *respond(event, signal) {
      if (event.kind === "question-rejected")
        console.info(`[lab agent] question rejected: ${event.reason}`);
      const text = replyText(event);
      await wait(replyDelayMs, signal);
      const words = text.split(" ");
      for (let i = 0; i < words.length && !signal.aborted; i++) {
        if (i > 0) await wait(wordMs, signal);
        if (!signal.aborted) yield (i === 0 ? "" : " ") + words[i];
      }
    },
  };
}

/** The stand-in the thread uses unless it is given a real agent. */
export const labAgent = createLabAgent();
