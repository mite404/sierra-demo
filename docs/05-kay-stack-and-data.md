# Kay's stack and data boundaries - a reference

What YakLabs has published about how Kay is built and what data it holds, read on 2026-09-26.
Everything here comes from their public pages; anything inferred is marked **inferred**.
Legal pages change: re-read the sources before quoting them in the interview.

## Sources

| Page | URL | Version read |
| --- | --- | --- |
| Data Processing Agreement (DPA) | https://meetkay.ai/dpa | "Last updated September 20, 2026", effective 19 August 2026 |
| Data Use (sub-processor list, authoritative) | https://meetkay.ai/data | as served 2026-09-26 |
| Privacy Policy | https://meetkay.ai/privacy | as served 2026-09-26 |
| Careers and job posts | https://meetkay.ai/careers | Design Engineer, Design Engineer: Infrastructure, Frontend Engineer, Developer Experience, AI Harnesses, Cloud Infrastructure |
| Marketing sites | https://meetkay.ai, https://yaklabs.ai | page source and response headers |
| Kay docs (4 pages: welcome, quickstart, developer overview, own OAuth client) | https://docs.meetkay.ai (full index at `/llms.txt`) | as served 2026-09-26 |

## The stack

| Layer | What they use | Evidence |
| --- | --- | --- |
| Codebase | One TypeScript monorepo: "a desktop app, a daemon, cloud services, and dozens of plugins" (pnpm or Turborepo style tooling) | Developer Experience post |
| App UI | React and CSS; "data flow across process boundaries"; **macOS only** as of 2026-10-01 (the quickstart: "runs on macOS today. Windows and Linux are not available yet"; Apple silicon and Intel builds), while the Frontend post asks for macOS and Windows experience, so Windows may follow | Frontend and Design Engineer: Infrastructure posts, Quickstart |
| Desktop shell | Electron, **inferred** and unconfirmed: a Node-heavy TypeScript stack with a daemon, and an app data folder named after the app (`~/Library/Application Support/Yak/`) | Privacy Policy §6, job posts |
| Systems language | Rust or Go is a nice-to-have for the AI Harnesses role only ("Systems-language experience (Rust, Go) alongside TypeScript"); nothing says the backend uses it | AI Harnesses post |
| Hosted services | "the API, the inference gateway", plus Cloudflare-hosted "OAuth broker, downloads, release operations, build cache, website, and careers" | DPA Annex III, Data Use |
| Inference gateway | **Bifrost**, an open-source LLM gateway written in Go (by Maxim AI), self-hosted on Fly.io: "Our inference gateway is not a sub-processor. It runs Bifrost, open-source software we self-host on Fly.io." It offers one OpenAI-compatible API across 20+ providers and can be configured from a file, which fits the DPA's no-storage setting "re-applied from a fixed file on every restart" | Data Use |
| Hosting and database | Fly.io: "Application hosting and managed PostgreSQL", Ashburn, Virginia | Data Use, DPA Annex III |
| Edge | Cloudflare: website delivery, the OAuth broker, software update delivery | Data Use |
| Sign-in | WorkOS (the downloads site redirects through WorkOS AuthKit); the DPA's Annex III still says Clerk, so the annex is stale and the Data Use page, which the DPA calls authoritative, wins | Data Use, downloads.meetkay.ai |
| Hosted models | Fireworks AI for text inference; Deepgram (announced) for transcription; Tavily (announced) for web search; users may bring their own Anthropic, OpenAI or OpenRouter key | Data Use, Privacy Policy §4 |
| Analytics and logs | PostHog | Data Use |
| Billing, feedback | Stripe; GitHub issues | Data Use |
| Marketing sites | meetkay.ai is Astro with no client JavaScript; yaklabs.ai is hand-written HTML; both behind Cloudflare | page source, headers |
| Docs site | Mintlify (a hosted docs service, itself Next.js on Vercel, behind Cloudflare) | response headers, `generator` meta |

## The DPA in brief

**The principle.** "Kay runs on your own computer, so most of what your people do with it never
reaches us at all." Annex II calls this "architectural minimisation" and "the primary control rather
than a marketing point".

**What stays on the device** (never reaches YakLabs): conversations, the files Kay reads, the notes
it keeps, credentials (in the OS credential store, Keychain on macOS), local logs, the local search
index. Conversation transcripts are stored unencrypted on disk; the Privacy Policy recommends
full-disk encryption.

**What YakLabs does hold:**

- Account and organisation records (name, email, profile image, membership, pending invites).
- Usage records: model, provider, tokens or audio duration, computed cost, timestamp, user and
  organisation ids; no content.
- Support and feedback content.
- Product usage measurements (on by default, can be switched off) and beta diagnostics (opt-in),
  pseudonymised.
- For the connection broker: a per-install device id and a SHA-256 hash of each refresh token.

**What passes through without being kept:** prompt, response, audio and transcript content on the
hosted paths. "It is forwarded to a model provider and streamed back. It is not written to disk and
it is not retained by us." The gateway's no-storage configuration "is re-applied from a fixed file
on every restart", and no request can opt back into storage.

**Bring your own key:** prompts go "directly from your machine to that provider" and never reach
YakLabs.

**Retention:** gateway logs are metadata only, kept 7 days; hosted-service logs in PostHog 14 days;
abuse rate-limit counters swept about hourly; backups age out after 10 days. Usage and billing
records sit in an append-only ledger kept seven years for tax law, with no content in them.

**Engineering habits worth noting:**

- *Data classification by construction:* "Every field in the diagnostics channel is classified
  before it may leave the device ... enforced in code with a test that fails on a new unclassified
  field, rather than by reviewer diligence." The same idea as turning our contrast rule (ADR-065)
  into a test.
- *Stated gaps:* "We hold no SOC 2 or ISO 27001 certification today. We would rather say so here
  than let a security review discover it later."
- *No training:* they do not train on customer data, and require the same of every default model
  provider.

**Sub-processors (Data Use page, 2026-09-26):** WorkOS, Stripe, Fly.io, Cloudflare, Fireworks AI,
GitHub, PostHog; announced: Deepgram, Tavily. Not sub-processors: their own inference gateway, and
model providers users connect themselves. ElevenLabs was one and no longer is.

## What this means for our vertical slice

- **Conversations stay on the device.** A slice that stores chat history in a cloud database
  contradicts the product's central privacy promise (ADR-075).
- **The cloud holds only what Kay's cloud holds:** a gateway that streams and stores nothing, and
  usage metadata without content.
- **Kay's backend is separate services, not server functions attached to a web router:** the desktop
  app calls the API and the gateway over HTTPS. The slice should keep the same split (ADR-076,
  ADR-077).

## What the docs add (docs.meetkay.ai)

**A small core plus extensions, built that way today.** "Kay is a small stable core plus a set of
extensions. That isn't a description of a future plugin ecosystem - it's how Kay is built today.
Gmail, GitHub, Notion, Slack, and the rest are plugins loaded through the same contract your own
code would use."

**Two ways to extend Kay:**

| | Skill | Plugin |
| --- | --- | --- |
| What it is | A Markdown file of instructions (`SKILL.md` with `name` and `description` front matter) | A package that runs inside Kay, with Kay's own authority |
| Where it lives | `~/.kay/agent/skills/<name>/`, a project's `.kay/skills/`, or a git repository; Kay also reads `.claude/skills/`, so Claude Code skills work as-is | A git repository |
| Tooling | A text editor | The plugin SDK: `@yaklabs-ai/plugin-sdk` and `@yaklabs-ai/plugin-protocol`, private packages on GitHub Packages (organization members and design partners only) |

**What a plugin can contribute:** tools the agent can call; integrations (a connected service with
its own sign-in); addressable resources under its own `scheme://` (Kay's own guide is
`skill://skills/authoring`), which the agent reads like anything else; bundled skills; and **Pages,
"full React apps hosted inside Kay's workspace"**.

**The approval model:** "the agent can propose, but only a human can grant." The agent can stage a
skill or plugin source, request a permission, or ask to connect an integration, but cannot approve
any of them; approval is a review card in the conversation, enabling a plugin is a second approval,
and writing files into the plugins directory "fails closed rather than loading whatever it finds".

**Onboarding is a conversation:** Kay looks at installed apps, top-level Documents folders, git
identity and history from other AI coding tools, asks for consent with "a permission card you answer
yourself", and offers to connect Slack, Gmail, GitHub, Calendar and Notion.

**Other facts:** MCP support exists in internal testing but is not in the released build; Kay picks
the model for each task and asks before anything consequential (sending, changing a file, spending
money); updates download in the background and install only on "Restart to update"; the app is
signed and notarized as Big Wombat LLC, distributed as a `.dmg`; Google can be connected through the
user's own OAuth client (a "Desktop app" client type).

**What this means for the slice:** our lab can be shaped as a Kay plugin: its cards as a Page (a
React app), its catalog as tools, and its rules as a bundled skill; and its "Needs attention" card
and fail-closed catalog already follow Kay's "the agent proposes, the human grants" model (ADR-078).

## Inferences worth stating carefully

**Business model: inference looks bundled (inferred).** "No API keys, no model to pick, no setup
file", the DPA's metered usage records ("computed cost ... metering usage for billing") and the
Stripe sub-processor suggest that customers pay Kay and Kay pays the model providers (Fireworks by
default), with bringing your own key as the optional exception. Nothing published states pricing.

**Voice.** "ElevenLabs is no longer a sub-processor. Until 11 August 2026 it provided our hosted
speech-to-text ... Deepgram is the announced replacement" (Data Use page); on-device transcription
is also offered. So ElevenLabs did Kay's transcription, not speech output, and nothing published
mentions Kay speaking replies aloud. Worth asking about in the interview, since the slice reads
replies aloud (ADR-079).

**Electron or Tauri: undecided, roughly even.** Nothing published names the desktop shell.

- *For Electron:* "deep TypeScript and Node" in the Developer Experience post, and an app data
  folder named after the app (`~/Library/Application Support/Yak/`), Electron's default; Tauri
  defaults to a reverse-domain identifier, though either can be overridden.
- *For Tauri:* Rust is a nice-to-have for the harness role; and Kay has a separate daemon, so
  TypeScript plugins could run in a Node or Bun process beside a Rust shell (Tauri calls such
  helpers "sidecars"), with plugin Pages in the web view either way.
- *Not evidence:* a DuckDuckGo AI summary claiming "Yak AI is built using Tauri" merges unrelated
  products (Yaak, an API client built with Tauri, and OpenYak); its sources do not mention Kay or
  YakLabs.
- *How to settle it:* an Electron app contains `Contents/Frameworks/Electron Framework.framework`; a
  Tauri app on macOS renders in WebKit, Safari's engine, so the slice should be checked in WebKit
  either way.

## Bifrost, checked against its docs (docs.getbifrost.ai)

| Question | Answer |
| --- | --- |
| Streams Claude? | Yes: the Anthropic provider supports chat and chat streaming |
| Voice | ElevenLabs: speech output (`/v1/audio/speech`, streamed) and transcription (`/v1/audio/transcriptions`, not streamed). **Deepgram is not a Bifrost provider**, so Kay presumably reaches Deepgram through another path |
| Browser calls (CORS) | `client.allowed_origins`, default `["*"]`; set it to the demo's origin |
| Access control | `enforce_auth_on_inference: true` plus virtual keys, each with a budget (USD over a window) and a rate limit; raw provider keys never leave the gateway |
| Content storage | `disable_content_logging: true` keeps metadata only; `allow_per_request_content_storage_override: false` makes that global setting authoritative, the same promise as Kay's DPA ("no individual request can opt back into storage"); observability connectors have their own flag |
| Fly.io | A deployment guide: `fly deploy --image docker.io/maximhq/bifrost:latest`, or build from source |
| Before going public | Set the dashboard password and a `setup_token` first; serve behind TLS (Fly terminates it) |

**Dictation today** uses the browser's built-in speech recognition (`webkitSpeechRecognition` in
`DictationModal.tsx`). In Chrome that usually sends audio to Google's servers, which does not match
Kay's on-device or gateway-only rule, and a de-Googled Chromium such as Helium may not offer it at
all; ElevenLabs transcription through the gateway (record, then transcribe) is the fit with Kay's
architecture.
