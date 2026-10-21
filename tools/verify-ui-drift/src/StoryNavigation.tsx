import { APP_SHELL } from "./app-target.ts";
import type { Report, StorybookState } from "./report.ts";

function storyHref(run: string, story: string) {
  return `/storybook/${run}/?path=/story/${story}`;
}

/** Links a capture to the retained story and the source paths recorded by its build. */
export function StorySource({
  run,
  story,
  index,
}: {
  run: string;
  story: string;
  index: StorybookState;
}) {
  if (story === APP_SHELL.id)
    return (
      <span className="story-source">
        <code>{APP_SHELL.source}</code> · Production SPA
      </span>
    );
  const entry =
    index.kind === "available" ? index.stories.find((item) => item.id === story) : undefined;
  if (!entry) return <span className="story-source">Storybook build unavailable</span>;
  return (
    <span className="story-source">
      <a href={storyHref(run, story)} target="_blank" rel="noreferrer">
        Storybook ↗
      </a>
      <code title={`Story: ${entry.importPath}`}>{entry.componentPath ?? entry.importPath}</code>
    </span>
  );
}

/** Lists every indexed story, including targets that were not captured in this run. */
export function StoryInventory({ report, index }: { report: Report; index: StorybookState }) {
  return (
    <details className="story-inventory">
      <summary>Capture inventory · {report.indexedStories} stories + app shell</summary>
      <p>
        Only selected targets appear in the results. Commands below build and capture fresh
        evidence. Storybook links open this run’s retained build; no separate server is needed.
      </p>
      <p>
        <code>pnpm verify-ui-drift run --all --app</code> captures every story and the full app
        shell.
      </p>
      <div className="inventory-scroll">
        <ul>
          <li>
            <div>
              <strong>
                {APP_SHELL.title} / {APP_SHELL.name}
              </strong>
              <code>{APP_SHELL.source}</code>
            </div>
            <span>
              {report.selectedStories.includes(APP_SHELL.id)
                ? "Selected in this run"
                : "Not captured"}
            </span>
            <code>pnpm verify-ui-drift run --app</code>
          </li>
          {index.kind === "available" ? (
            index.stories.map((story) => (
              <li key={story.id}>
                <div>
                  <a href={storyHref(report.id, story.id)} target="_blank" rel="noreferrer">
                    {story.title} / {story.name} ↗
                  </a>
                  <code>{story.componentPath ?? story.importPath}</code>
                </div>
                <span>
                  {report.selectedStories.includes(story.id)
                    ? "Selected in this run"
                    : "Not captured"}
                </span>
                <code>pnpm verify-ui-drift run --stories {story.id}</code>
              </li>
            ))
          ) : (
            <li>{index.reason}</li>
          )}
        </ul>
      </div>
    </details>
  );
}
