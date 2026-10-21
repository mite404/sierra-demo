import { flatRoutes } from "@react-router/fs-routes";
import path from "node:path";
import { matchRoutes, type RouteObject } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

// The route config the build makes from the files under src/routes, as React Router reads it.
type Config = Awaited<ReturnType<typeof flatRoutes>>;

// The config's routes as the router matches them, each keeping its file as its id.
function routesOf(config: Config): RouteObject[] {
  return config.map((each) => ({
    id: each.file,
    path: each.path,
    index: each.index,
    children: each.children === undefined ? undefined : routesOf(each.children),
  })) as RouteObject[]; // oxlint-disable-line typescript/no-unsafe-type-assertion -- index and children are exclusive only in the router's own types
}

let routes: RouteObject[] = [];

// The file of the deepest route an address lands on, or none.
const fileAt = (pathname: string) => matchRoutes(routes, pathname)?.at(-1)?.route.id;

beforeAll(async () => {
  // React Router's plugin names the app directory before `flatRoutes` reads it; here the test does.
  Object.assign(globalThis, { __reactRouterAppDirectory: path.resolve(import.meta.dirname) });
  routes = routesOf(await flatRoutes());
});

describe("the route files", () => {
  it("send the bare demo address and its threads to the one redirect module", () => {
    expect(fileAt("/demo/weekly-brief")).toBe("routes/demo.weekly-brief.$.tsx");
    expect(fileAt("/demo/weekly-brief/t/demo-brief")).toBe("routes/demo.weekly-brief.$.tsx");
  });

  it("send the live playground's old address to its redirect module", () => {
    expect(fileAt("/playground")).toBe("routes/playground.tsx");
  });

  it("have a page of their own for the design tooling, outside the signed-in shell", () => {
    expect(fileAt("/verify-ui-tooling")).toBe("routes/verify-ui-tooling.tsx");
  });

  it("have no /new", () => {
    expect(fileAt("/new")).not.toBe("routes/_app.new.tsx");
  });
});
