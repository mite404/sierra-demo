import { index, route, type RouteConfig } from "@react-router/dev/routes";

// This independent demo never mounts the inherited shell, canvas, or simulated browser.
export default [
  index("routes/simulation.tsx"),
  route("*", "routes/simulation-redirect.tsx"),
] satisfies RouteConfig;
