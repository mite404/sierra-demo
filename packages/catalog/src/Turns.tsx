import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject,
} from "react";
import { AgentTree } from "./AgentTree";
import { CatalogCard } from "./CatalogCard";
import { ChartGlyph } from "./ComposeBox";
import { Disclosure } from "./Disclosure";
import { InteractiveCard } from "./InteractiveCard";
import type { CardAttachment } from "./interactive";
import { Prose, type Recover } from "./QuietProse";
import { blocksOf, hasWork, stepBacking, workLabel, type Ended } from "./reply";
import type { ThreadMessage } from "./thread";
import type { AnsweredMessage } from "./transcript";
import { WorkDetails } from "./WorkDetails";

type UserMessage = Extract<ThreadMessage, { role: "user" }>;
type AgentMessage = Extract<ThreadMessage, { role: "agent" }>;

// A bubble's text clamps past eight of its 24px lines, so a long paste never buries the reply.
const BUBBLE_CLAMP_PX = 8 * 24;
// The clamp as the bubble's style hands it to thread.css, so the height has one source.
const CLAMP_STYLE: CSSProperties & Record<`--${string}`, string> = {
  "--bubble-clamp": `${BUBBLE_CLAMP_PX}px`,
};

// How a reply that stopped short says so, first on its note (ADR-139).
const ENDED_LABELS: Record<Ended, string> = {
  interrupted: "Interrupted · Incomplete answer",
  failed: "Could not start",
  cancelled: "Stopped by you",
};

// Whether a stopped reply offers to try again: not one the user stopped, who can simply ask, nor
// one whose failure says asking again cannot help.
const RETRYABLE: Record<Ended, boolean> = { interrupted: true, failed: true, cancelled: false };
const retryable = (message: AgentMessage, ended: Ended): boolean =>
  RETRYABLE[ended] && message.failure?.retry !== false;

// Whether the reply has reasoning to show (ADR-166).
const thought = (message: AgentMessage): boolean => (message.thinking ?? "") !== "";

// Content someone can already be reading, independent of the reasoning or wait indicator.
const hasContent = (message: AgentMessage): boolean =>
  hasWork(message) ||
  blocksOf(message).length > 0 ||
  message.payload !== undefined ||
  message.interactive !== undefined;

// Choose on the first reasoning delta, before paint; never move an open disclosure later.
function useThinkingPlacement(thinking: boolean, reading: boolean): "above" | "below" {
  const [placement, setPlacement] = useState<"above" | "below" | undefined>(
    thinking ? "above" : undefined,
  );
  const position = placement ?? (reading ? "below" : "above");
  if (thinking && placement === undefined) setPlacement(position);
  return position;
}

// Calls `onChange` with whether `el`'s content runs taller than `maxPx`, now and as it resizes
// (a narrower panel wraps more lines). Returns the function that stops watching.
function watchOverflow(el: HTMLElement, maxPx: number, onChange: (over: boolean) => void) {
  const observer = new ResizeObserver(() => {
    onChange(el.scrollHeight > maxPx + 1); // a rounding pixel is not a hidden line
  });
  observer.observe(el);
  return () => {
    observer.disconnect();
  };
}

// Whether `element`'s content runs taller than `maxPx`. Measured before paint, so a long bubble
// never flashes unclamped.
function useClamped(element: RefObject<HTMLElement | null>, maxPx: number): boolean {
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = element.current;
    return el ? watchOverflow(el, maxPx, setClamped) : undefined;
  }, [element, maxPx]);
  return clamped;
}

// The bubble's text, clamped with a fade and a Show more when it runs past eight lines.
function BubbleText({ text }: { text: string }) {
  const body = useRef<HTMLParagraphElement>(null);
  const clamped = useClamped(body, BUBBLE_CLAMP_PX);
  const [open, setOpen] = useState(false);
  return (
    <div className="user-bubble">
      <p ref={body} data-clamped={clamped && !open ? "" : undefined} style={CLAMP_STYLE}>
        {text}
      </p>
      {clamped && (
        <button
          type="button"
          className="bubble-more"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * The user's turn: a tinted bubble resting on the thread (ADR-025), with no time of its own: the
 * latest reply's stamp dates the exchange. Past eight lines the text folds behind a fade and a
 * Show more, so a long paste never pushes the reply out of view.
 */
export function UserTurn({ message, ref }: { message: UserMessage; ref?: Ref<HTMLElement> }) {
  return (
    <article ref={ref} className="turn turn-user" data-turn-id={message.id} aria-label="You">
      <BubbleText text={message.text} />
      {message.attachments !== undefined && message.attachments.length > 0 && (
        <ul className="sent-context" aria-label="Sent with this message">
          {message.attachments.map((item) => (
            <li key={item.turnId} className="context-chip">
              <ChartGlyph />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {message.files !== undefined && message.files.length > 0 && (
        <ul className="sent-context" aria-label="Files sent with this message">
          {message.files.map((item) => (
            <li key={item.id} className="context-chip">
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * The user's answers to the agent's docked questions (ADR-039), on one quiet surface: each
 * question over the answer it got, consecutive answers together. Each pair keeps its turn's id,
 * so a search or a jump lands on the answer itself.
 */
export function AnsweredTurns({
  messages,
  ref,
}: {
  messages: AnsweredMessage[];
  ref?: Ref<HTMLElement>;
}) {
  return (
    <article ref={ref} className="turn turn-answered" aria-label="Your answers">
      <dl>
        {messages.map((message) => (
          <div key={message.id} className="answered-pair" data-turn-id={message.id}>
            <dt>{message.question}</dt>
            <dd>{message.text}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

// A reply with nothing to show yet: the same working glyph the sidebar shows and a plain,
// factual line, the agent's own narration when it gave one, never a guessed tool name (ADR-041).
// The glyph's label carries the announcement, so the visible line stays out of a screen
// reader's way.
function Waiting({ activity }: { activity: string | undefined }) {
  return (
    <div className="turn-pending">
      <AgentTree label={activity ?? "Thinking"} />
      <span aria-hidden="true">{activity ?? "Thinking…"}</span>
    </div>
  );
}

// The model's reasoning, folded above an empty reply or below content already being read
// (ADR-166). While the reply has nothing else to show, its
// summary is the wait itself, the working glyph and "Thinking…"; after, a plain "Thinking".
// The reasoning is set as it came, never as Markdown: it is not the answer.
function Thinking({ thinking = "", live }: { thinking: AgentMessage["thinking"]; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (thinking === "") return null;
  return (
    <div className="turn-thinking">
      <Disclosure
        summary={
          live ? (
            <span className="work-live">
              {/* The glyph's label announces the state; the words beside it are for the eye. */}
              <AgentTree label="Thinking" />
              <span aria-hidden="true">Thinking…</span>
            </span>
          ) : (
            "Thinking"
          )
        }
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
      >
        <p className="turn-thinking-text">{thinking}</p>
      </Disclosure>
    </div>
  );
}

// What a streaming reply is doing now, quietly under its words (ADR-139).
function Activity({ activity }: { activity: string }) {
  return (
    <div className="turn-activity">
      <AgentTree label={activity} />
      <span aria-hidden="true">{activity}</span>
    </div>
  );
}

// The reply's words, or its placeholder while it has none, and what it is doing now; a reply
// whose disclosure carries its activity (`quiet`) shows neither placeholder nor line here, and
// one that is thinking shows no placeholder: its Thinking summary is the wait.
function Words({
  message,
  cardsCarry,
  shareable,
  quiet,
  recover,
}: {
  message: AgentMessage;
  cardsCarry: boolean | undefined;
  shareable: boolean;
  quiet: boolean;
  recover: Recover | undefined;
}) {
  const blocks = blocksOf(message); // → Block[]
  const { streaming, activity } = message;
  const narrates = streaming === true && !quiet;
  if (blocks.length === 0)
    return narrates && !thought(message) && !hasContent(message) && <Waiting activity={activity} />;
  return (
    <>
      <Prose
        blocks={blocks}
        cardsCarry={cardsCarry}
        shareable={shareable}
        recover={recover}
        stepOf={stepBacking(message.work)}
      />
      {narrates && activity !== undefined && <Activity activity={activity} />}
    </>
  );
}

// How a reply that stopped short ended, why, and a way to ask again (ADR-139).
function EndedNote({
  message,
  ended,
  onRetry,
}: {
  message: AgentMessage;
  ended: Ended;
  onRetry: ((turnId: string) => void) | undefined;
}) {
  return (
    <div className="turn-ended" data-ended={ended}>
      <p className="turn-ended-label">{ENDED_LABELS[ended]}</p>
      {message.failure !== undefined && <p>{message.failure.detail}</p>}
      {retryable(message, ended) && onRetry !== undefined && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onRetry(message.id);
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * The agent's turn: its reasoning folded at the top when it arrives first, below existing
 * content otherwise (ADR-166); one
 * restrained disclosure above the words once there is work, mounted as the work starts and
 * carrying what the reply is doing now and then what it amounted to (ADR-139, amended); Quiet
 * prose with any cards between its paragraphs (ADR-140); how it ended when it stopped short. A
 * reply with no work narrates under its words instead, and one with no words or reasoning yet is
 * its own placeholder. While a reply is still streaming in, the turn is marked busy for
 * assistive technology.
 * @param cardsCarry Whether a card's header carries it out onto the canvas (ADR-089).
 * @param shareable Whether a card offers its own share link; not on a page already shared
 * (ADR-064, ADR-131).
 * @param onRetry Asks for a reply that stopped short again; without it there is no Try again.
 * @param recover Sends a limitation's recovery; without it the prompt shows with no button.
 * @param stamp How long ago this reply arrived, on the thread's latest reply alone: "just now",
 * then in 20-minute steps (turnTime.ts). Absent on every other turn.
 * @param measure The stop its interactive card shows, when the host holds the choice.
 */
export function AgentTurn({
  message,
  onChoose,
  cardsCarry,
  shareable = true,
  onRetry,
  recover,
  stamp,
  measure,
  ref,
}: {
  message: AgentMessage;
  onChoose: (attachment: CardAttachment) => void;
  cardsCarry: boolean | undefined;
  shareable?: boolean;
  onRetry?: (turnId: string) => void;
  recover?: Recover;
  stamp?: string;
  measure?: string;
  ref?: Ref<HTMLElement>;
}) {
  const carries = cardsCarry !== false;
  const { ended } = message;
  const worked = hasWork(message);
  const reading = hasContent(message);
  const thinking = thought(message);
  const placement = useThinkingPlacement(thinking, reading);
  // The reasoning is the reply's live line until work or words take over.
  const thinkingLive = message.streaming === true && !reading;
  const reasoning = <Thinking thinking={message.thinking} live={thinkingLive} />;
  return (
    <article
      ref={ref}
      className="turn turn-agent"
      data-turn-id={message.id}
      aria-label="Agent"
      aria-busy={message.streaming === true || undefined}
    >
      {placement === "above" && reasoning}
      {worked && (
        <WorkDetails work={message.work} label={workLabel(message)} cardsCarry={cardsCarry} />
      )}
      <Words
        message={message}
        cardsCarry={cardsCarry}
        shareable={shareable}
        quiet={worked}
        recover={recover}
      />
      {message.payload !== undefined && (
        <CatalogCard
          payload={message.payload}
          context="thread"
          draggable={carries}
          shareable={shareable}
        />
      )}
      {message.interactive !== undefined && (
        <InteractiveCard
          payload={message.interactive}
          turnId={message.id}
          onChoose={onChoose}
          measure={measure}
          draggable={carries}
          shareable={shareable}
        />
      )}
      {placement === "below" && reasoning}
      {ended !== undefined && <EndedNote message={message} ended={ended} onRetry={onRetry} />}
      {stamp !== undefined && <time className="turn-stamp">{stamp}</time>}
    </article>
  );
}
