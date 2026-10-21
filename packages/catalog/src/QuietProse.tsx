import { useId } from "react";
import { CatalogCard } from "./CatalogCard";
import type { Block, Inline, Mark } from "./prose";

/**
 * What a limitation's recovery does where the thread can send: `onRecover` sends its prompt as
 * the reader's next message, and `busy` holds the button while a reply streams. A page that can
 * send nothing, such as a shared one, passes none and shows the prompt alone.
 */
export type Recover = { onRecover: (prompt: string) => void; busy: boolean };

// Each mark sets its run in one semantic tag, so emphasis is `<strong>` for the reader and for
// assistive technology alike, never a styled span (ADR-140).
const MARK_TAGS: Record<Mark, "strong" | "em" | "code"> = {
  strong: "strong",
  em: "em",
  code: "code",
};

// Schemes a link from a reply may open: the web and mail. Anything else (`javascript:`, `data:`)
// shows as its words alone.
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function safeHref(href: string): string | undefined {
  try {
    return SAFE_SCHEMES.has(new URL(href).protocol) ? href : undefined;
  } catch {
    return undefined; // a relative or malformed address has nowhere safe to go
  }
}

// Plain text children only, never `dangerouslySetInnerHTML`: a reply's words are data.
function InlineView({ inline }: { inline: Inline }) {
  if (inline.kind === "link") {
    const href = safeHref(inline.href);
    if (href === undefined) return inline.text;
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {inline.text}
      </a>
    );
  }
  if (inline.mark === undefined) return inline.text;
  const Tag = MARK_TAGS[inline.mark];
  return <Tag>{inline.text}</Tag>;
}

// A reply only ever grows at its end: a run, an item or a block never moves once it has
// arrived, so its place is its identity. The index keys below rely on that.
function Inlines({ content }: { content: Inline[] }) {
  // oxlint-disable-next-line react/no-array-index-key -- see above
  return content.map((inline, i) => <InlineView key={i} inline={inline} />);
}

// A block's key: its place (see Inlines), or a card's id when it has one, so a later version of
// that card updates the one on screen, keeping its state, rather than mounting a new one.
function blockKey(block: Block, place: number): string {
  return block.kind === "card" && block.id !== undefined ? `card:${block.id}` : `${place}`;
}

// What the reply could not do, in its own voice, then the request it offers instead: quoted,
// and a button that sends it where the thread can (`recover`). The button names the prompt it
// sends as its description.
function LimitationView({
  block,
  recover,
}: {
  block: Extract<Block, { kind: "limitation" }>;
  recover: Recover | undefined;
}) {
  const promptId = useId();
  const { recovery } = block;
  return (
    <div className="prose-limitation">
      <p>{block.text}</p>
      {recovery !== undefined && (
        <p className="prose-limitation-prompt" id={promptId}>
          <q>{recovery.prompt}</q>
        </p>
      )}
      {recovery !== undefined && recover !== undefined && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={recover.busy}
          aria-describedby={promptId}
          onClick={() => {
            recover.onRecover(recovery.prompt);
          }}
        >
          {recovery.label}
        </button>
      )}
    </div>
  );
}

// A catalog card between paragraphs, at the thread's measure, naming the step whose evidence it
// is, if any, so a recap's outcome can land on it.
function ProseCard(props: {
  payload: unknown;
  carries: boolean;
  shareable: boolean;
  step: string | undefined;
}) {
  const { payload, carries, shareable, step } = props;
  return (
    <div className="prose-card" data-step={step}>
      <CatalogCard payload={payload} context="thread" draggable={carries} shareable={shareable} />
    </div>
  );
}

function BlockView({
  block,
  carries,
  shareable,
  recover,
  stepOf,
}: {
  block: Block;
  carries: boolean;
  shareable: boolean;
  recover: Recover | undefined;
  stepOf: ((payload: unknown) => string | undefined) | undefined;
}) {
  switch (block.kind) {
    case "paragraph":
      return (
        <p>
          <Inlines content={block.content} />
        </p>
      );
    case "heading":
      return (
        <h3>
          <Inlines content={block.content} />
        </h3>
      );
    case "list":
      return (
        <ul>
          {block.items.map((item, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- see Inlines
            <li key={i}>
              <Inlines content={item} />
            </li>
          ))}
        </ul>
      );
    case "card":
      return (
        <ProseCard
          payload={block.payload}
          carries={carries}
          shareable={shareable}
          step={stepOf?.(block.payload)}
        />
      );
    case "limitation":
      return <LimitationView block={block} recover={recover} />;
    default: {
      const unhandled: never = block;
      return unhandled;
    }
  }
}

/**
 * Quiet prose (ADR-140): a reply's paragraphs, headings, lists and emphasis in the app's own
 * type, with catalog cards between them and what the reply could not do said in its voice.
 * Streaming and finished replies render through these same elements, so nothing restyles as a
 * reply completes. Text keeps a 510px measure; cards take the thread's.
 * @param cardsCarry Whether a card's header carries it out onto the canvas (ADR-089).
 * @param shareable Whether a card offers its own share link (ADR-064).
 * @param recover Sends a limitation's recovery; without it the prompt shows with no button.
 * @param stepOf The step of the reply's work a card is the evidence of (`stepBacking`).
 */
export function Prose({
  blocks,
  cardsCarry,
  shareable = true,
  recover,
  stepOf,
}: {
  blocks: Block[];
  cardsCarry?: boolean;
  shareable?: boolean;
  recover?: Recover;
  stepOf?: (payload: unknown) => string | undefined;
}) {
  return (
    <div className="quiet-prose">
      {blocks.map((block, i) => (
        <BlockView
          key={blockKey(block, i)}
          block={block}
          carries={cardsCarry !== false}
          shareable={shareable}
          recover={recover}
          stepOf={stepOf}
        />
      ))}
    </div>
  );
}
