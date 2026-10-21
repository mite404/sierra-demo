import { useEffect, useState, type ReactNode } from "react";
import { CardHeader } from "./CardHeader";
import { CatalogCard } from "./CatalogCard";
import { ShareButton } from "./ShareButton";
import type { SharedCard } from "./share";
import {
  attachmentLabel,
  axisMax,
  fillSentence,
  initialStopIndex,
  resolveInteractive,
  shownStopIndex,
  summarize,
  type CardAttachment,
  type InteractiveSelection,
} from "./interactive";
import { LiveSentence, ShowWork, StepSlider, StopChart, TRANSITION_MS } from "./interactiveParts";
import { prefersReducedMotion } from "./reducedMotion";
import "./interactive.css";

// Whether the bars are easing from one stop to another: true from the moment the stop changes,
// and as the card first draws, for TRANSITION_MS. Only then may Recharts animate. It animates any
// change of the bars' geometry, so a pane dragged narrower restarted a 300ms slide on every frame
// of the drag and left the last bar cut off at the chart's edge (Ethan); a resize now redraws at
// once, as the cards without a slider always did.
function useMorphing(index: number): boolean {
  const [shown, setShown] = useState(index);
  const [easingTo, setEasingTo] = useState<number | null>(index); // → the stop the bars ease to
  if (shown !== index) {
    // Stored from the render before (React's pattern for state that follows a prop).
    setShown(index);
    setEasingTo(index);
  }
  // A stop chosen mid-ease names a new target, so the clock starts again for it.
  useEffect(() => {
    const settle =
      easingTo === null
        ? undefined
        : window.setTimeout(() => {
            setEasingTo(null);
          }, TRANSITION_MS);
    return () => {
      window.clearTimeout(settle);
    };
  }, [easingTo]);
  return easingTo !== null;
}

/** What an interactive card takes; `InteractiveCard` says what each does. */
export type InteractiveCardProps = {
  payload: unknown;
  turnId: string;
  onChoose: (attachment: CardAttachment) => void;
  measure?: string;
  shareable?: boolean;
  /** Let the header carry the card out, as onto the compose canvas (ADR-089). */
  draggable?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};

// The card's title bar: the share button and a host's controls, and the drag that carries it.
function InteractiveHeader({
  title,
  payload,
  shareable = true,
  draggable = false,
  leading,
  trailing,
}: InteractiveCardProps & { title: string }) {
  const card = { v: 1, kind: "interactive", payload } satisfies SharedCard;
  return (
    <CardHeader
      title={title}
      leading={leading}
      actions={
        (shareable || trailing !== undefined) && (
          <>
            {shareable && <ShareButton card={card} />}
            {trailing}
          </>
        )
      }
      drag={draggable ? { card, title } : undefined}
    />
  );
}

// A card the catalog approved: its stop, the host's when it holds one, and the controls over it.
function ApprovedCard({
  selection,
  ...card
}: InteractiveCardProps & { selection: InteractiveSelection }) {
  const { props } = selection;
  const stops = props.control.stops;
  const [own, setIndex] = useState(initialStopIndex(selection));
  const index = shownStopIndex({ stops, measure: card.measure, own });
  const morphing = useMorphing(index);

  function choose(next: number) {
    setIndex(next);
    card.onChoose({
      turnId: card.turnId,
      label: attachmentLabel(stops[next], props.period),
      state: { measure: stops[next].label },
    });
  }

  return (
    <section className="card interactive-card" data-context="thread">
      <InteractiveHeader {...card} title={props.title} />
      <LiveSentence parts={fillSentence(props.sentence, summarize(stops[index], props.period))} />
      <StopChart
        stop={stops[index]}
        max={axisMax(selection)}
        animate={morphing && !prefersReducedMotion()}
      />
      <StepSlider
        id={`${card.turnId}-measure`}
        label={props.control.label}
        stops={stops}
        index={index}
        onChoose={choose}
      />
      <ShowWork steps={props.steps} source={props.source} />
    </section>
  );
}

/**
 * An interactive catalog card (ADR-029): a stepped slider switches the measure, and the
 * chart and the agent's sentence update instantly without calling the model. Each choice
 * is reported through `onChoose` so it can ride along with the next message (ADR-030).
 * @param measure The stop to show, by its label, for a host that holds the choice itself (the
 * thread panel keeps it with what rides along to the agent); omitted, the card keeps its own.
 * @param shareable Show the share button (ADR-064); off on the public page itself.
 * @param leading A host's control before the title, such as a lane's collapse (ADR-134).
 * @param trailing A host's control at the title bar's far end, after the share button, such as
 * a lane's close.
 */
export function InteractiveCard(card: InteractiveCardProps) {
  const result = resolveInteractive(card.payload);
  // An invalid payload gets the same honest catalog-limit card as any other rejection.
  if (result.kind === "rejected")
    return (
      <CatalogCard
        payload={null}
        context="thread"
        leading={card.leading}
        trailing={card.trailing}
      />
    );
  return <ApprovedCard {...card} selection={result.selection} />;
}
