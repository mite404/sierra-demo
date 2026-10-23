# @yaklabs/runtime

This package provides the incremental NDJSON line reader used by the Sierra simulation client.

`linesOf(body)` decodes UTF-8 chunks in order, yields each non-empty line, and yields a final
partial line when the stream ends. If its consumer stops early, it cancels the stream reader.

The simulation's persisted definitions and results live in the gateway's `SIMULATION_DB` D1
binding. Browser state and saved simulation data are not stored by this package.
