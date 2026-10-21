import { z } from "zod/v4";

// The app's alias makes configuration precede every schema, including in the SQLite worker.
z.config({ jitless: true });

export * from "zod/v4";
