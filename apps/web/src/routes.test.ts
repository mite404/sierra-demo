import { matchRoutes, type RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import config from "./routes";

// The config's routes as the router matches them, each keeping its file as its id.
function routesOf(): RouteObject[] {
  return config.map((each) => ({
    id: each.file,
    path: "path" in each ? each.path : undefined,
    index: "index" in each ? each.index : undefined,
  }));
}

// The file of the deepest route an address lands on, or none.
const fileAt = (pathname: string) => matchRoutes(routesOf(), pathname)?.at(-1)?.route.id;

describe("the route files", () => {
  it("mounts the Sierra simulation at the root", () => {
    expect(fileAt("/")).toBe("routes/simulation.tsx");
  });

  it("redirects inherited and unknown paths to the simulation", () => {
    expect(fileAt("/playground")).toBe("routes/simulation-redirect.tsx");
    expect(fileAt("/t/old-thread")).toBe("routes/simulation-redirect.tsx");
    expect(fileAt("/unknown")).toBe("routes/simulation-redirect.tsx");
  });
});
