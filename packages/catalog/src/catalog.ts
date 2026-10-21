import { z } from "zod";

const text = z.string().trim().min(1).max(120);
const shared = {
  title: text,
  source: text,
  unit: z.string().trim().min(1).max(24),
  rows: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(40),
        value: z.number().finite().min(-1e12).max(1e12).nullable(),
      }),
    )
    .max(100),
};

/** Single source of truth for the permitted agent response; unknown keys are rejected. */
export const selectionSchema = z.discriminatedUnion("component", [
  z.strictObject({
    catalogVersion: z.literal("1"),
    component: z.literal("LineChart"),
    props: z.strictObject({
      ...shared,
      variant: z.enum(["trend", "snapshot"]),
    }),
  }),
  z.strictObject({
    catalogVersion: z.literal("1"),
    component: z.literal("BarChart"),
    props: z.strictObject({ ...shared, variant: z.literal("comparison") }),
  }),
  z.strictObject({
    catalogVersion: z.literal("1"),
    component: z.literal("DataTable"),
    props: z.strictObject({ ...shared, variant: z.literal("audit") }),
  }),
]);

export type Selection = z.infer<typeof selectionSchema>;
export type DataProps = Selection["props"];
export type Resolution =
  | { kind: "approved"; selection: Selection }
  | { kind: "fallback"; selection: Selection; reason: string }
  | { kind: "empty"; title: string }
  | { kind: "rejected"; reason: string };

/** JSON Schema supplied to a future structured-output model call. */
export const agentSchema = z.toJSONSchema(selectionSchema);

/** Validates untrusted agent output; never salvages fields from rejected payloads. */
export function resolve(input: unknown): Resolution {
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success)
    return {
      kind: "rejected",
      reason:
        "This request is outside catalog v1 or its data contract. No unvalidated content was rendered.",
    };
  const selection = parsed.data;
  if (selection.props.rows.length === 0) return { kind: "empty", title: selection.props.title };
  if (
    selection.component === "LineChart" &&
    selection.props.rows.filter((row) => row.value !== null).length < 2
  ) {
    return {
      kind: "fallback",
      reason: "A trend needs at least two known observations. Showing the exact values instead.",
      selection: {
        catalogVersion: "1",
        component: "DataTable",
        props: { ...selection.props, variant: "audit" },
      },
    };
  }
  return { kind: "approved", selection };
}
