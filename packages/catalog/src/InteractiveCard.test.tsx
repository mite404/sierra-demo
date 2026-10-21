import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveCard } from "./InteractiveCard";
import { profitCard } from "./thread";

const render = (props: Partial<Parameters<typeof InteractiveCard>[0]> = {}) =>
  renderToStaticMarkup(
    <InteractiveCard
      payload={profitCard}
      turnId="t1"
      onChoose={() => {}}
      shareable={false}
      {...props}
    />,
  );

describe("InteractiveCard, pinned before its split", () => {
  it("opens on the payload's initial stop", () => {
    expect(render()).toMatchSnapshot();
  });

  it("shows each stop the host holds, by label", () => {
    for (const stop of profitCard.props.control.stops) {
      expect(render({ measure: stop.label })).toMatchSnapshot(stop.label);
    }
  });

  it("keeps its own stop when the host names one it does not have", () => {
    expect(render({ measure: "Not a stop" })).toBe(render());
  });

  it("refuses an invalid payload with the catalog's limit card", () => {
    expect(render({ payload: { kind: "made up" } })).toMatchSnapshot();
  });
});
