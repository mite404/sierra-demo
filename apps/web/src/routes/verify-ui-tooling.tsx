import { Band, Bento, Closing, Question } from "../components/landing-blocks";
import { Bar, Hero, Ticker } from "../components/landing-hero";
import { useLightOnly } from "../theme";
import "../verify-ui-tooling.css";

export function meta() {
  return [{ title: "Design tooling · Yaklabs / Verify" }];
}

/**
 * The design tooling page (ADR-160): a landing page for `tools/verify-ui-drift` carrying
 * Ethan's copy over the tool's own evidence. The run's terminal opens
 * it under the headline, then the verdicts roll by, the question, a bento of what a run gives,
 * the band with the second headline, and the seal. Public, outside the shell, and reached from
 * the welcome's seal. It is drawn for the light theme alone and holds the root on it while open.
 */
export default function VerifyUiToolingPage() {
  useLightOnly();
  return (
    <main className="tooling">
      <Bar />
      <Hero />
      <Ticker />
      <Question />
      <Bento />
      <Band />
      <Closing />
      <footer>
        <span>
          Internal use only · <code>tools/verify-ui-drift</code> · the README has the commands and
          the operating limits.
        </span>
        <span>Yaklabs / Verify</span>
      </footer>
    </main>
  );
}
