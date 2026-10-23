import { Button } from "@yaklabs/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@yaklabs/ui/components/collapsible";
import { linesOf } from "@yaklabs/runtime/ndjson";
import {
  simulationEvent,
  type SimulationResult,
  type SimulationSelection,
} from "gateway/simulation-contract";
import { useEffect, useRef, useState } from "react";

/** Secondary forced calls are explicitly separate from the customer's actual model behavior. */
export function SimulationProbe({ persona }: { persona: SimulationSelection["case"] }) {
  const active = useRef<AbortController | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => () => active.current?.abort(), []);
  const probe = async (version: SimulationSelection["version"]) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setResult(null);
    setError(false);
    try {
      const response = await fetch("/api/simulation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ case: persona, source: "probe", version, pressure: false }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("Probe unavailable");
      for await (const line of linesOf(response.body)) {
        const event = simulationEvent.parse(JSON.parse(line));
        if (event.kind === "end" && !controller.signal.aborted) setResult(event.result);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <Collapsible className="lab-probe">
      <CollapsibleTrigger className="lab-probe-trigger">
        Tool probe · developer teaching control
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p>
          Forced executor calls on separate, fresh fixtures. No model. Does not change your customer
          test.
        </p>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void probe("corrected");
          }}
        >
          Probe corrected boundary
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void probe("vulnerable");
          }}
        >
          Probe vulnerable example
        </Button>
        <output>
          {busy
            ? "Running tool probe…"
            : result
              ? `Tool probe · ${result.selection.version} training example · ${result.verdict}`
              : "No probe run yet."}
        </output>
        {result && (
          <pre className="lab-json" aria-label="Tool probe JSON">
            {JSON.stringify(
              { toolAttempts: result.trace, before: result.before, after: result.after },
              null,
              2,
            )}
          </pre>
        )}
        {error && <p role="alert">Probe incomplete. No grade.</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}
