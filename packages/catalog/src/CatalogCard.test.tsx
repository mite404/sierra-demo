import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CatalogCard } from "./CatalogCard";

it("keeps exact decimal values and escapes text in the audit table", () => {
  const html = renderToStaticMarkup(
    <CatalogCard
      payload={{
        catalogVersion: "1",
        component: "DataTable",
        props: {
          title: "<img src=x onerror=alert(1)>",
          source: "test",
          unit: "hours",
          variant: "audit",
          rows: [
            { label: "A", value: 0.123456789 },
            { label: "B", value: null },
          ],
        },
      }}
    />,
  );
  expect(html).toContain("0.123456789");
  expect(html).toContain("Not recorded");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
});
