import { useState } from "react";
import { AgentTree } from "./AgentTree";
import { CatalogCard } from "./CatalogCard";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { Disclosure } from "./Disclosure";
import { IconButton } from "./IconButton";
import { LinkIcon, ShareIcon } from "./icons";
import { Menu, type TriggerProps } from "./Menu";
import { Modal } from "./Modal";
import { ReadingTools } from "./ReadingTools";
import { ShareView } from "./ShareView";
import { scenarios } from "./fixtures";
import { encodeCard } from "./share";
import { threads } from "./thread";
import "./App.css";

const groups = [
  {
    name: "Foundations",
    components: ["Button", "Disclosure", "Icon Button", "Menu", "Modal", "Text Field"],
  },
  { name: "Catalog", components: ["Approved Answers"] },
  { name: "Motion", components: ["Agent Thinking Animation"] },
  { name: "Thread", components: ["Chat Thread Panel", "Reading Tools"] },
  { name: "Share", components: ["Public Share Page"] },
];

function menuTrigger(props: TriggerProps) {
  return (
    <button {...props} className="btn">
      Open menu
    </button>
  );
}

/** Component gallery grouped like Storybook, rendering the catalog's real components. */
export function App({ home = "/" }: { home?: string }) {
  const [selected, setSelected] = useState("Button");
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("No item selected");
  const group = groups.find((item) => item.components.includes(selected));
  const previews = {
    Button: (
      <div className="lab-row">
        <button className="btn">Show my work</button>
        <button className="btn btn-sm">Compact</button>
        <button className="btn" disabled>
          Disabled
        </button>
      </div>
    ),
    Disclosure: (
      <Disclosure
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
        summary="How I got this"
      >
        <p>Read last week&apos;s orders, grouped them by day, and subtracted refunds.</p>
      </Disclosure>
    ),
    "Icon Button": (
      <div className="lab-row">
        <IconButton label="Share this card">
          <ShareIcon />
        </IconButton>
        <IconButton label="Copy link">
          <LinkIcon />
        </IconButton>
        <IconButton label="Unavailable" disabled>
          <ShareIcon />
        </IconButton>
      </div>
    ),
    Menu: (
      <>
        <Menu
          label="Example menu"
          placement="below-end"
          trigger={menuTrigger}
          items={[
            {
              label: "First item",
              onSelect: () => {
                setChoice("First item selected");
              },
            },
            {
              label: "Second item",
              onSelect: () => {
                setChoice("Second item selected");
              },
            },
          ]}
        />
        <p>
          <output>{choice}</output>
        </p>
      </>
    ),
    Modal: (
      <div className="lab-modal-stage">
        <button
          className="btn"
          onClick={() => {
            setOpen(true);
          }}
        >
          Open modal
        </button>
        {open && (
          <Modal
            labelledBy="lab-modal-title"
            onClose={() => {
              setOpen(false);
            }}
          >
            <div className="lab-modal-content">
              <h2 id="lab-modal-title">Pause the thread?</h2>
              <p>Tab stays inside. Escape closes the dialog.</p>
              <button
                className="btn"
                onClick={() => {
                  setOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </Modal>
        )}
      </div>
    ),
    "Text Field": (
      <div className="lab-fields">
        <label>
          Forecast horizon
          <input className="field" placeholder="How many weeks ahead?" />
        </label>
        <label>
          Filled
          <input className="field" defaultValue="The next 4 weeks" />
        </label>
        <label>
          Disabled
          <input className="field" placeholder="Unavailable" disabled />
        </label>
      </div>
    ),
    "Approved Answers": (
      <div className="lab-answers">
        {Object.entries(scenarios).map(([key, scenario]) => (
          <section key={key}>
            <h2>{scenario.label}</h2>
            <CatalogCard payload={scenario.payload} />
          </section>
        ))}
      </div>
    ),
    "Agent Thinking Animation": (
      <div className="lab-row">
        <AgentTree />
        <span>Working</span>
      </div>
    ),
    "Chat Thread Panel": <ChatThreadPanel thread={threads.trend} cardsCarry={false} />,
    "Reading Tools": (
      <div className="lab-reading-tools">
        <ReadingTools
          messages={threads.profit.messages}
          onJump={(id) => {
            setChoice(threads.profit.messages.find((message) => message.id === id)?.text ?? "");
          }}
          onFind={() => {}}
        />
        {choice !== "No item selected" && (
          <p>
            <output>{choice}</output>
          </p>
        )}
      </div>
    ),
    "Public Share Page": (
      <ShareView
        hash={"#" + encodeCard({ v: 1, kind: "catalog", payload: scenarios.trend.payload })}
      />
    ),
  };
  const Page = selected === "Public Share Page" ? "div" : "main";

  return (
    <div className="app lab-gallery">
      <aside>
        <a className="brand" href={home}>
          Component Lab
        </a>
        <nav aria-label="Component catalog">
          {groups.map((item) => (
            <div key={item.name}>
              <p className="sidebar-label">{item.name}</p>
              {item.components.map((component) => (
                <button
                  key={component}
                  aria-current={selected === component ? "page" : undefined}
                  onClick={() => {
                    setSelected(component);
                    setOpen(false);
                    setChoice("No item selected");
                  }}
                >
                  {component}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <Page className="lab-main">
        <header className="topbar">
          <span>
            {group?.name} / <b>{selected}</b>
          </span>
          <span className="badge neutral">Synthetic data</span>
        </header>
        <section className="lab-preview" aria-label={`${selected} preview`} key={selected}>
          <h1>{selected}</h1>
          {Object.entries(previews).find(([name]) => name === selected)?.[1]}
        </section>
      </Page>
    </div>
  );
}
