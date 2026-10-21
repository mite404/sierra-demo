import { describe, expect, it } from "vitest";
import { resolve } from "./catalog";

const props = {
  title: "Cases closed",
  source: "Example service desk",
  unit: "cases",
  variant: "trend",
  rows: [
    { label: "Mon", value: 12 },
    { label: "Tue", value: 7 },
  ],
};
const valid = { catalogVersion: "1", component: "LineChart", props };

describe("agent contract", () => {
  it("accepts approved component and props", () => {
    expect(resolve(valid)).toMatchObject({
      kind: "approved",
      selection: valid,
    });
  });
  it.each(["commits", "cases", "hours", "USD", "percent", "x", "x".repeat(24)])(
    "accepts unit %s without changing catalog version",
    (unit) => {
      expect(resolve({ ...valid, props: { ...props, unit } })).toMatchObject({
        kind: "approved",
        selection: { catalogVersion: "1", props: { unit } },
      });
    },
  );
  it.each([" commits ", ` ${"x".repeat(24)} `])("trims unit %s before validation", (unit) => {
    expect(resolve({ ...valid, props: { ...props, unit } })).toMatchObject({
      kind: "approved",
      selection: { props: { unit: unit.trim() } },
    });
  });
  it.each(["", " \t\n ", "x".repeat(25), null, 3, ["commits"]])(
    "rejects empty, oversized or non-string unit %j",
    (unit) => {
      expect(resolve({ ...valid, props: { ...props, unit } })).toMatchObject({
        kind: "rejected",
      });
    },
  );
  it.each([
    { ...valid, component: "CustomChart" },
    { ...valid, children: [] },
    { ...valid, props: { ...props, style: { color: "red" } } },
    { ...valid, props: { ...props, variant: "rainbow" } },
    {
      ...valid,
      props: { ...props, rows: [{ label: "Mon", value: Infinity }] },
    },
    {
      ...valid,
      props: {
        ...props,
        rows: Array.from({ length: 101 }, () => ({ label: "x", value: 1 })),
      },
    },
    { ...valid, catalogVersion: "2" },
    "<script>alert(1)</script>",
  ])("rejects unknown grammar, versions and unsafe data", (input) => {
    expect(resolve(input)).toMatchObject({ kind: "rejected" });
  });
  it("uses an honest empty state without fabricating numbers", () => {
    expect(resolve({ ...valid, props: { ...props, rows: [] } })).toMatchObject({
      kind: "empty",
    });
  });
  it("falls back to a table when one observation cannot establish a trend", () => {
    expect(
      resolve({
        ...valid,
        props: { ...props, rows: [{ label: "Mon", value: 12 }] },
      }),
    ).toMatchObject({
      kind: "fallback",
      selection: { component: "DataTable" },
    });
  });
  it("does not turn null into zero or claim a trend with one known value", () => {
    expect(
      resolve({
        ...valid,
        props: {
          ...props,
          rows: [
            { label: "Mon", value: null },
            { label: "Tue", value: 7 },
          ],
        },
      }),
    ).toMatchObject({
      kind: "fallback",
      selection: {
        props: {
          rows: [
            { label: "Mon", value: null },
            { label: "Tue", value: 7 },
          ],
        },
      },
    });
  });
});
