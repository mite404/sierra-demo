import type { AgentEvent } from "@yaklabs/catalog/agent";
import { firstAskTitle, withUserTurn, type Stamp } from "./conversation";
import type { Mint } from "./mint";
import type { Command, NewItem } from "./protocol";
import type { Store } from "./store";
import { NEW_THREAD, type ThreadId } from "./workspace";

// What each write command does to the store: the loop runs one, then pushes the state.

/** What a write needs: the store, and the mint that names and stamps what it writes. */
export type Writer = { store: Store; mint: Mint };
// The thread menu's writes (ADR-126): each is one store call, answered with done.
const MENU_KINDS = ["mark", "delete", "restore", "share", "unshare"] as const;
type MenuCommand = Extract<Command, { kind: (typeof MENU_KINDS)[number] }>;

/**
 * Makes the item with a freshly minted id; a child's lane lands at `at` in the same write.
 * @throws When the store refuses it (say, an unknown parent or project).
 */
export function create({ store, mint }: Writer, item: NewItem): string {
  const now = mint.now().toISOString();
  const blank = { createdAt: now, updatedAt: now, messages: [] };
  switch (item.kind) {
    case "project": {
      const id = mint.project();
      store.addProject({ id, name: item.name, createdAt: now });
      return id;
    }
    case "main": {
      const id = mint.thread();
      const place = { kind: "main", projectId: item.projectId } as const;
      store.addThread({ ...blank, id, title: item.title ?? NEW_THREAD, place, draft: "" });
      return id;
    }
    case "child": {
      const id = mint.thread();
      const place = { kind: "child", parentId: item.parentId } as const;
      store.addThread({ ...blank, id, title: item.title, place, draft: item.draft }, item.at);
      return id;
    }
    default: {
      const unhandled: never = item;
      return unhandled;
    }
  }
}

/** Whether a command is one of the thread menu's writes. */
export function isMenuWrite(command: Command): command is MenuCommand {
  return MENU_KINDS.some((kind) => kind === command.kind);
}

/**
 * Runs one of the thread menu's writes (ADR-126) on the store, stamped with the mint's time.
 * @throws When the store refuses it (say, an unknown thread, or a snooze that is not ahead).
 */
export function menuWrite({ store, mint }: Writer, command: MenuCommand): void {
  const now = mint.now().toISOString();
  switch (command.kind) {
    case "mark":
      store.mark(command.threadId, command.change, now, command.note);
      return;
    case "delete":
      store.remove(command.threadId, now);
      return;
    case "restore":
      store.restore(command.threadId, now);
      return;
    case "share":
      store.addShare(command.share);
      return;
    case "unshare":
      store.removeShare(command.shareId);
      return;
    default: {
      const unhandled: never = command;
      return unhandled;
    }
  }
}

// Names a thread still called "New thread" with `title`, its first message's words; a thread
// someone has named keeps its name, and no title changes nothing.
function nameUntitled(store: Store, threadId: ThreadId, title?: string): void {
  if (title === undefined) return;
  const thread = store.workspace().threads.find((each) => each.id === threadId);
  if (thread?.title === NEW_THREAD) store.rename({ kind: "thread", id: threadId }, title);
}

/**
 * Saves the user's side of `event` before the agent runs, so it survives a failed reply, and
 * names a thread still called "New thread" from its first message (`firstAskTitle`).
 */
export function recordAsk(store: Store, threadId: ThreadId, event: AgentEvent, asked: Stamp): void {
  const before = store.transcript(threadId)?.messages ?? []; // → ThreadMessage[]
  store.changeTranscript(threadId, (transcript) => withUserTurn(transcript, event, asked));
  nameUntitled(store, threadId, firstAskTitle(before, event));
}
