import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { IconButton } from "./IconButton";
import { BookmarkIcon, CloseIcon, SearchIcon, StepIcon } from "./icons";
import { Menu, type MenuItem, type TriggerProps } from "./Menu";
import type { Find } from "./searchMarks";
import {
  matchStatus,
  matchesOf,
  requestsOf,
  stepMatch,
  type Match,
  type Request,
} from "./threadReading";
import type { ThreadMessage } from "./thread";
import { timeLabel } from "./turnTime";

// What the bookmark button says, read aloud and on hover.
const BOOKMARKS = "Your requests";

// One item per request, oldest first, each jumping to its turn; the full request shows on hover.
function bookmarkItems(requests: Request[], onJump: (turnId: string) => void): MenuItem[] {
  if (requests.length === 0)
    return [{ label: "No requests yet", disabled: true, onSelect: () => {} }];
  return requests.map((request) => ({
    id: request.id,
    label: request.label,
    detail: timeLabel(request.time),
    hint: request.text,
    onSelect: () => {
      onJump(request.id);
    },
  }));
}

// The bookmark button: a click opens the list, an Alt-click (Option on a Mac) skips the list
// and goes straight to the latest request.
function bookmarkTrigger(latest: string | undefined, onJump: (turnId: string) => void) {
  return function renderBookmarkTrigger(props: TriggerProps) {
    return (
      <IconButton
        {...props}
        label={BOOKMARKS}
        title={`${BOOKMARKS} (Alt-click for the latest)`}
        onClick={(event: MouseEvent) => {
          if (event.altKey && latest !== undefined) onJump(latest);
          else props.onClick();
        }}
      >
        <BookmarkIcon />
      </IconButton>
    );
  };
}

// Puts the caret in the field as it opens.
function focusOnMount(field: HTMLInputElement | null): void {
  field?.focus();
}

// The open search: a field, the count, previous and next, and close. Enter in the field steps to
// the next match and Shift+Enter to the previous one; Escape on any of its controls closes it.
// It says what it shows as it changes, and that it shows nothing once it closes.
function SearchBar({
  id,
  messages,
  onFind,
  onClose,
}: {
  id: string;
  messages: ThreadMessage[];
  onFind: (find: Find | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<Match>();
  const matches = matchesOf(messages, query); // → Match[], reading order
  const report = useEffectEvent(onFind);
  useEffect(
    () => () => {
      report(null);
    },
    [],
  );

  function step(direction: 1 | -1) {
    const next = stepMatch(matches, current, direction); // → a Match, or undefined
    setCurrent(next);
    onFind({ query, current: next });
  }

  function keys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    }
  }

  return (
    <search id={id} className="reading-search">
      <input
        ref={focusOnMount}
        className="field"
        type="search"
        aria-label="Search this thread"
        placeholder="Search this thread"
        value={query}
        onKeyDown={keys}
        onChange={(event) => {
          setQuery(event.target.value);
          setCurrent(undefined);
          onFind({ query: event.target.value, current: undefined });
        }}
      />
      <output className="reading-count">{query.trim() && matchStatus(matches, current)}</output>
      <IconButton
        label="Previous match"
        onKeyDown={keys}
        disabled={matches.length === 0}
        onClick={() => {
          step(-1);
        }}
      >
        <StepIcon />
      </IconButton>
      <IconButton
        label="Next match"
        onKeyDown={keys}
        disabled={matches.length === 0}
        onClick={() => {
          step(1);
        }}
      >
        <StepIcon down />
      </IconButton>
      <IconButton label="Close search" onKeyDown={keys} onClick={onClose}>
        <CloseIcon />
      </IconButton>
    </search>
  );
}

// Calls `fold` on the first pointer move outside `bar`; the bar's own list counts as inside.
// Returns the function that stops listening.
function foldWhenAway(bar: RefObject<HTMLElement | null>, fold: () => void): () => void {
  const away = (event: PointerEvent) => {
    if (!(event.target instanceof Node && bar.current?.contains(event.target) === true)) fold();
  };
  document.addEventListener("pointermove", away);
  return () => {
    document.removeEventListener("pointermove", away);
  };
}

// Whether the pointer is on `bar`, for unfolding it. Leaving sets it false, and so does the first
// move anywhere outside it: a list that closes under the pointer takes the pointer's target away
// with it, and the browser then sends the bar no leave at all.
function usePointerIn(bar: RefObject<HTMLElement | null>) {
  const [pointerIn, setPointerIn] = useState(false);
  useEffect(
    () =>
      pointerIn
        ? foldWhenAway(bar, () => {
            setPointerIn(false);
          })
        : undefined,
    [bar, pointerIn],
  );
  return {
    pointerIn,
    onPointerEnter: () => {
      setPointerIn(true);
    },
    onPointerLeave: () => {
      setPointerIn(false);
    },
  };
}

/**
 * A thread's reading tools, floating above its compose box. The bar follows the pointer
 * (thread.css): clear until the pointer is over the thread's turns, fading up as it leaves the
 * compose box and back as it leaves the thread, so across a canvas of lanes one bar shows at a
 * time. At rest it is one bookmark on a translucent fill; with the pointer on it, a keyboard in
 * it, or either tool open, it unfolds leftward to show Search too and keeps its translucent fill.
 * Search the thread's words and step through each place they occur, as an editor's find
 * does, or jump back to any request the user sent, listed by its first 48 characters and its
 * time. An Alt-click on the bookmark goes straight to the latest request. Where a jump lands, and
 * how a match shows, is the host's.
 * @param messages The thread's turns as they stand now, including ones sent since it opened.
 * @param onJump Brings the turn with this id into view.
 * @param onFind Shows what the search finds: every match, and the one stepped to; null once the
 * search closes.
 */
export function ReadingTools({
  messages,
  onJump,
  onFind,
}: {
  messages: ThreadMessage[];
  onJump: (turnId: string) => void;
  onFind: (find: Find | null) => void;
}) {
  const [searching, setSearching] = useState(false);
  const bar = useRef<HTMLFieldSetElement>(null);
  const { pointerIn, ...pointerHandlers } = usePointerIn(bar); // → unfolds the bar (thread.css)
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchId = useId();
  const requests = requestsOf(messages); // → Request[], oldest first

  function closeSearch() {
    setSearching(false);
    searchButton.current?.focus();
  }

  return (
    <fieldset
      ref={bar}
      className="reading-tools"
      aria-label="Reading tools"
      data-open={searching ? "" : undefined}
      data-unfolded={pointerIn ? "" : undefined}
      {...pointerHandlers}
    >
      {/* Folded away until the bar is in use (thread.css); left of the bookmark, so the bar grows
          leftward and the button under the pointer stays put. */}
      <span className="reading-more">
        <span className="reading-fold">
          {searching && (
            <SearchBar id={searchId} messages={messages} onFind={onFind} onClose={closeSearch} />
          )}
          <IconButton
            ref={searchButton}
            label="Search this thread"
            aria-expanded={searching}
            aria-controls={searching ? searchId : undefined}
            onClick={() => {
              if (searching) closeSearch();
              else setSearching(true);
            }}
          >
            <SearchIcon />
          </IconButton>
        </span>
      </span>
      <Menu
        label={BOOKMARKS}
        placement="above-end"
        items={bookmarkItems(requests, onJump)}
        trigger={bookmarkTrigger(requests.at(-1)?.id, onJump)}
      />
    </fieldset>
  );
}
