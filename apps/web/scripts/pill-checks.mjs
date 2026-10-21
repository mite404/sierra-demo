// Checks for the rail's name pills (ADR-144), on a desktop window with motion on: every place
// names itself in an ink pill with the panel closed, docked and peeking, and on keyboard focus.
// oxlint-disable no-await-in-loop -- one pointer drives one page, so each step waits for the last
import { shotPath } from "./lever.mjs";
import { placeOf, RAIL_PLACES } from "./rail-places.mjs";
import { CLOSE_MS, contrast, openDesk, peek, phaseOf, round } from "./sidebar-checks.mjs";

// What a place outside the demo's scope adds in its pill.
const OUT_OF_SCOPE = "Out of demo scope";
// A live place and one outside the demo, whose pills are read with the panel docked and peeking.
const SAMPLED = RAIL_PLACES.filter((place) => ["Lab", "Memory"].includes(place.name));

// Runs in the page: the pill up now, as its words, inks, shape and box, with the rail behind it,
// and the arrow a site elsewhere adds after its name. The tooltip's own pointer, which a pill
// never has, is Base UI's arrow, the one part that carries a side.
function readPill(el) {
  const style = getComputedStyle(el);
  const rail = document.querySelector('[data-slot="rail"]');
  const hint = el.querySelector("span");
  const glyph = el.querySelector("svg.lucide-arrow-up-right");
  const box = el.getBoundingClientRect();
  return {
    words: el.textContent,
    text: style.color,
    hint: hint === null ? style.color : getComputedStyle(hint).color,
    fill: style.backgroundColor,
    shell: getComputedStyle(rail).backgroundColor,
    round: Number.parseFloat(style.borderRadius) >= box.height / 2,
    arrow: el.querySelector("[data-side]") !== null,
    elsewhere: glyph === null ? null : getComputedStyle(glyph).color,
    elsewhereHidden: glyph?.getAttribute("aria-hidden") ?? null,
    instant: el.dataset.instant ?? null,
    left: box.left,
    railRight: rail.getBoundingClientRect().right,
  };
}

// The pill a rail place shows, once the pointer has rested on it or `focus` has taken it there:
// its words and look, and for a place outside the demo, how its softer "Out of demo scope"
// reads on the ink. Null when the rail has no such place.
async function pillOn(page, place, { focus = false } = {}) {
  const target = placeOf(page, place);
  if ((await target.count()) === 0) return null;
  if (focus) {
    await target.focus();
  } else {
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
  }
  const pill = page.locator('[data-slot="tooltip-content"]').filter({
    hasText: place.name === "Lab" ? "Component Examples" : place.name,
  });
  await pill.waitFor({ timeout: 2000 });
  await page.waitForTimeout(200);
  const look = await pill.evaluate(readPill);
  return {
    ...look,
    onText: contrast(look.text, look.fill),
    hintOnFill: contrast(look.hint, look.fill),
    onShell: contrast(look.fill, look.shell),
    elsewhereOnFill: look.elsewhere === null ? null : contrast(look.elsewhere, look.fill),
  };
}

// Whether a site elsewhere's pill ends in its arrow, hidden from a screen reader and 3:1 on the
// ink as a graphic must be (rule 16), and every other pill has none.
const opensElsewhere = (external, pill) =>
  external === true
    ? pill.elsewhereOnFill >= 3 && pill.elsewhereHidden === "true"
    : pill.elsewhere === null;

// Whether a pill says what its place is, in the ink pill's look, legibly, clear of the rail.
function pillReads({ name, outOfScope, external }, pill) {
  const label = name === "Lab" ? "Component Examples" : name;
  const words = outOfScope === true ? `${label} · ${OUT_OF_SCOPE}` : label;
  return (
    pill.words === words &&
    pill.onText >= 7 &&
    pill.hintOnFill >= 4.5 &&
    pill.onShell >= 3 &&
    pill.round === true &&
    pill.arrow === false &&
    opensElsewhere(external, pill) &&
    pill.left >= pill.railRight
  );
}

// A pill's note for the check's detail.
const pillNote = (label, pill) =>
  `${label} ${JSON.stringify(pill.words)}: text ${round(pill.onText)}:1, hint ${round(pill.hintOnFill)}:1, shell ${round(pill.onShell)}:1, round ${pill.round}, arrow ${pill.arrow}, ${pill.elsewhere === null ? "" : `opens elsewhere ${round(pill.elsewhereOnFill)}:1, `}instant ${pill.instant}, ${round(pill.left - pill.railRight)}px past the rail`;

// P23's rest half: every place's pill in the collapsed rail, the next one opening at once.
async function pillsAtRest(page, theme) {
  const notes = [];
  let ok = true;
  await page.mouse.move(900, 300);
  for (const place of RAIL_PLACES) {
    const pill = await pillOn(page, place);
    if (pill === null) {
      ok = false;
      notes.push(`${theme} ${place.name}: missing`);
      continue;
    }
    await page.screenshot({
      path: shotPath(`P23-pill-${place.name.replaceAll(" ", "-")}-${theme}`),
      clip: { x: 0, y: 40, width: 320, height: 420 },
    });
    ok &&= pillReads(place, pill) && (place.name === "Home" || pill.instant === "delay");
    notes.push(pillNote(`${theme} rest`, pill));
  }
  return { ok, notes };
}

// P23's docked half: the sampled pills with the panel docked beside the rail.
async function pillsDocked(browser, theme) {
  const notes = [];
  let ok = true;
  const { context, page } = await openDesk(browser, { side: "open", theme });
  for (const place of SAMPLED) {
    await page.mouse.move(900, 300);
    await page.waitForTimeout(CLOSE_MS);
    const pill = await pillOn(page, place);
    ok &&= pill !== null && pillReads(place, pill);
    notes.push(
      pill === null ? `${theme} docked ${place.name}: missing` : pillNote(`${theme} docked`, pill),
    );
  }
  await page.screenshot({
    path: shotPath(`P23-pill-docked-${theme}`),
    clip: { x: 0, y: 40, width: 480, height: 420 },
  });
  await context.close();
  return { ok, notes };
}

// P23's peeking half: the sampled pills while the panel peeks, each over the panel, the pointer
// on the rail keeping the peek out.
async function pillsPeeking(browser, theme) {
  const notes = [];
  let ok = true;
  const { context, page } = await openDesk(browser, { theme });
  for (const place of SAMPLED) {
    await peek(page);
    const pill = await pillOn(page, place);
    await page.waitForTimeout(CLOSE_MS + 200);
    const phase = await phaseOf(page);
    ok &&= pill !== null && pillReads(place, pill) && phase === "open";
    notes.push(
      pill === null
        ? `${theme} peeking ${place.name}: missing`
        : `${pillNote(`${theme} peeking`, pill)}, peek ${phase}`,
    );
  }
  await page.screenshot({
    path: shotPath(`P23-pill-peeking-${theme}`),
    clip: { x: 0, y: 40, width: 480, height: 420 },
  });
  await context.close();
  return { ok, notes };
}

// P23's keyboard half: Tab onto a place, and its pill shows, with no pointer near.
async function pillOnFocus(browser, theme) {
  const { context, page } = await openDesk(browser, { theme });
  await page.mouse.move(900, 300);
  await placeOf(page, RAIL_PLACES[0]).focus();
  await page.keyboard.press("Tab");
  const place = RAIL_PLACES[1];
  const pill = await pillOn(page, place, { focus: true });
  await context.close();
  const ok = pill !== null && pillReads(place, pill);
  return {
    ok,
    notes: [pill === null ? `${theme} focus: missing` : pillNote(`${theme} focus`, pill)],
  };
}

/** The workspace lever's checks of the rail's name pills, by id; rail-checks.mjs registers them. */
export const pillChecks = {
  // The rail names every place in an ink pill, 7:1 for its text and 3:1 against the rail in either
  // theme, and a place outside the demo adds a softer "· Out of demo scope" that still clears
  // 4.5:1, and Documentation a softer arrow that says it opens elsewhere, 3:1 or more; the next
  // place's pill opens at once. The pills show in every state (ADR-144): with the panel closed,
  // docked, and peeking, where they sit over the panel and keep it out; and on keyboard focus.
  async P23(browser) {
    const notes = [];
    let ok = true;
    for (const theme of ["light", "dark"]) {
      const { context, page } = await openDesk(browser, { theme });
      const results = [await pillsAtRest(page, theme)];
      await context.close();
      for (const step of [pillsDocked, pillsPeeking, pillOnFocus]) {
        results.push(await step(browser, theme));
      }
      ok &&= results.every((result) => result.ok);
      notes.push(...results.flatMap((result) => result.notes));
    }
    return { ok, detail: notes.join("; ") };
  },
};
