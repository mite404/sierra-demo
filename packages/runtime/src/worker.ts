/// <reference lib="webworker" />
import { createAgentLoop, type Opened } from "./agentLoop";
import { liveMint } from "./mint";
import type { LegacyCanvas, Notice, RuntimeData, ScenarioName, Source } from "./protocol";
import { openSqliteStore, StorageUnavailableError } from "./sqliteStore";
import { ensureStarter, type Store } from "./store";

// What the page asks of the device's store.
type DeviceData = Extract<RuntimeData, { kind: "device" }>;

// This file only ever runs as the dedicated worker `startRuntime` creates (ADR-083).
declare const self: DedicatedWorkerGlobalScope;

// The one database the app keeps its threads in (ADR-081).
const DATABASE = "yaklabs";
// What every tab on the device queues on before it opens that database: sqlite-wasm's pool
// takes one worker at a time, and deletes itself when a second fails to take it (ADR-118).
const LOCK = "yaklabs-database";

// Never settles, so a lock whose callback returns it is held until the worker ends.
const forever = new Promise<never>(() => {});

function post(notice: Notice): void {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- workers have none
  self.postMessage(notice);
}

// Takes the lock for the rest of this worker's life once it is granted; resolves false instead
// when `ifAvailable` was asked and another worker has it.
function takeLock(options: LockOptions): Promise<boolean> {
  return new Promise((resolve) => {
    void navigator.locks.request(LOCK, options, (lock) => {
      resolve(lock !== null);
      return lock === null ? undefined : forever;
    });
  });
}

// Holds the database for this worker, first waiting as long as another tab has it, which the
// page hears as `held`. A browser without locks has no private file system to share either.
async function holdDatabase(): Promise<void> {
  if (!("locks" in navigator)) throw new StorageUnavailableError("This browser has no Web Locks");
  if (await takeLock({ ifAvailable: true })) return;
  post({ kind: "held" });
  await takeLock({});
}

// SQLite in the private file system when the browser allows it; memory otherwise, which the
// page learns from the source. Only the file on disk may migrate the v1 canvas keys: a memory
// store starts empty, so the page keeps the keys for a later run that reaches the file. A file
// that opened but cannot be read or migrated is not a refused file system: falling back would
// hide the threads it holds behind a fresh starter, so that start breaks with its reason.
async function openDeviceStore(
  legacy: LegacyCanvas | undefined,
): Promise<{ store: Store; source: Source }> {
  try {
    await holdDatabase();
    const store = await openSqliteStore({ kind: "opfs", name: DATABASE }, legacy);
    return { store, source: { kind: "device", storage: "opfs" } };
  } catch (error) {
    if (!(error instanceof StorageUnavailableError)) throw error;
    // oxlint-disable-next-line no-console -- the one place a worker can say why it fell back
    console.warn("[runtime] Threads stay in memory.", error.message);
    const store = await openSqliteStore({ kind: "memory" });
    return { store, source: { kind: "device", storage: "memory" } };
  }
}

// The fixtures load only when a scenario or a seed asks for them, so the device never ships them.
const fixtures = () => import("./scenarios");

async function openDevice({ legacy, seed }: DeviceData): Promise<Opened> {
  const mint = liveMint();
  const { store, source } = await openDeviceStore(legacy);
  const at = mint.now().toISOString();
  ensureStarter(store, at);
  if (seed === "demo-store") (await fixtures()).seedDemoStore(store, at);
  return { store, source, mint, faults: {} };
}

async function openScenario(name: ScenarioName): Promise<Opened> {
  return (await fixtures()).openScenario(name);
}

function open(data: RuntimeData): Promise<Opened> {
  return data.kind === "device" ? openDevice(data) : openScenario(data.name);
}

const handle = createAgentLoop({ post, open });

self.addEventListener("message", (event) => {
  void handle(event.data);
});
