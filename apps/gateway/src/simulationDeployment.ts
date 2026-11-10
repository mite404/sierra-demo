import { DurableObject } from "cloudflare:workers";
import { createSimulationApp } from "./simulationWorker";

/** Owns the public teaching workspace so authoring, runs and stop requests meet one instance. */
export class RefundLesson extends DurableObject<SimulationDeploymentEnv> {
  // ponytail: unfinished chats expire on object eviction, as on local service restart. Saved
  // definitions and completed evidence remain in D1; durable chat checkpoints can replace this.
  private readonly app = createSimulationApp();

  /** Streams the existing real model/tool loop without buffering or replaying a request. */
  fetch(request: Request): Promise<Response> {
    return Promise.resolve(this.app.fetch(request, this.env));
  }
}

export default {
  /** Routes every API request to the same lesson; Cloudflare serves non-API static assets. */
  fetch(request: Request, env: SimulationDeploymentEnv): Promise<Response> {
    return env.LESSON.get(env.LESSON.idFromName("subscription-refunds")).fetch(request);
  },
} satisfies ExportedHandler<SimulationDeploymentEnv>;
