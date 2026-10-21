// The ghost a carry lifts (carry.ts): a picture of its own, or a clone of the lifted element
// drawn away from home exactly as it is at home, inherited styles, selectors and container
// queries included, so what rides the pointer is the element it pictures.

// A size container around a lifted element at home: its names and type as computed, and the
// content box its container queries and cq units measure, in CSS pixels.
type HomeContainer = { name: string; type: string; width: number; height: number };

// Computed lengths such as "12.5px", added up in pixels.
function pixels(...lengths: string[]): number {
  return lengths.reduce((total, length) => total + parseFloat(length), 0);
}

// The content box of `element` on screen, to the fraction of a pixel that `clientWidth` rounds
// away: its border box less borders, padding and any scrollbar, which is a whole pixel wide.
function contentBoxOf(element: Element): { width: number; height: number } {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const borderX = pixels(style.borderLeftWidth, style.borderRightWidth);
  const borderY = pixels(style.borderTopWidth, style.borderBottomWidth);
  const insetX = borderX + pixels(style.paddingLeft, style.paddingRight);
  const insetY = borderY + pixels(style.paddingTop, style.paddingBottom);
  const barWidth = Math.round(box.width - borderX - element.clientWidth); // a vertical scrollbar's
  const barHeight = Math.round(box.height - borderY - element.clientHeight); // a horizontal one's
  return { width: box.width - insetX - barWidth, height: box.height - insetY - barHeight };
}

// Every size container around `lift` at home, outermost first, as the ghost rebuilds them.
function homeContainersOf(lift: HTMLElement): HomeContainer[] {
  const found: HomeContainer[] = [];
  for (let node = lift.parentElement; node; node = node.parentElement) {
    const { containerName, containerType } = getComputedStyle(node);
    if (containerType !== "normal")
      found.unshift({ name: containerName, type: containerType, ...contentBoxOf(node) });
  }
  return found;
}

// A plain box in the ghost for one container at home, with its names and type, at its content
// size, so a query or a cq unit that reached that container at home reaches this box and
// measures the same. Only a container on both axes takes a height: an inline-size one keeps
// the height of what it holds, as it does at home.
function standInFor({ name, type, width, height }: HomeContainer): HTMLElement {
  const box = document.createElement("div");
  box.style.containerName = name;
  box.style.containerType = type;
  box.style.width = `${width}px`;
  if (type.split(" ").includes("size")) box.style.height = `${height}px`;
  return box;
}

// An empty copy of each of `lift`'s ancestors below the body, around its clone. Laid out as if
// absent (`display: contents`), they still match the selectors and hand down the inherited
// styles that shaped `lift` at home, such as the thread's type size and line height, so the
// clone looks like the element it pictures. None of them stays a size container: with no box of
// its own, one would still be the container a query picks, and answer its every size feature
// "unknown" (CSS Conditional 5, 6.1), so a narrow thread's card would lose its compact layout.
// Their names stay, for a style query, which reads no box.
function atHome(lift: HTMLElement, clone: HTMLElement): HTMLElement {
  let wrapped = clone;
  for (let home = lift.parentElement; home && home !== document.body; home = home.parentElement) {
    const shell = document.createElement(home.localName);
    for (const { name, value } of home.attributes)
      if (name !== "id") shell.setAttribute(name, value);
    shell.style.display = "contents";
    shell.style.containerType = "normal";
    shell.append(wrapped);
    wrapped = shell;
  }
  return wrapped;
}

// The copies of `lift`'s ancestors inside a stand-in for each size container at home, the
// outermost outside, so every container query and cq unit in the clone finds its container at
// the size it had at home. The stand-ins go around the copies rather than between them, where
// they would break a child selector such as `.thread-panel > .thread-scroll`.
function inContainers(lift: HTMLElement, clone: HTMLElement): HTMLElement {
  const shells = atHome(lift, clone); // → the outermost shell, the clone inside
  return homeContainersOf(lift).reduceRight((inner, container) => {
    const box = standInFor(container); // → an empty, sized container
    box.append(inner);
    return box;
  }, shells);
}

// What rides the pointer: the picture, marked for the stylesheet, and whatever surrounds it.
function frame(picture: HTMLElement, around: HTMLElement = picture): HTMLElement {
  picture.dataset.carryPicture = "";
  const element = document.createElement("div");
  element.className = "carry-ghost";
  element.setAttribute("aria-hidden", "true");
  element.inert = true;
  element.append(around);
  return element;
}

/**
 * The picture that rides the pointer while a carry is lifted: `picture`'s own, such as a quote
 * chip, or a clone of `lift` at its size, drawn as it is at home, container queries and all.
 * Null when there is neither.
 */
export function ghostOf({
  lift,
  picture,
}: {
  lift?: HTMLElement;
  picture?: () => HTMLElement;
}): HTMLElement | null {
  if (picture) return frame(picture());
  if (!lift) return null;
  const clone = lift.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  const ghost = frame(clone, inContainers(lift, clone));
  ghost.style.setProperty("--carry-width", `${lift.getBoundingClientRect().width}px`);
  return ghost;
}
